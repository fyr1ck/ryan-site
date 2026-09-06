-- =============================================================================
-- 0001 — FUNDAÇÃO: extensões, helpers, perfis e RBAC baseado em banco
-- =============================================================================
-- Nenhuma permissão é decidida por e-mail hardcoded. Toda autorização passa por
-- user_roles + role_permissions, consultáveis por has_role()/authorize().
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";
create extension if not exists "pg_trgm";
create extension if not exists "unaccent";

-- -----------------------------------------------------------------------------
-- Helper: mantém updated_at coerente sem depender da aplicação
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Helper: slugify — usado por produtos, categorias, coleções e páginas
-- -----------------------------------------------------------------------------
create or replace function public.slugify(v text)
returns text
language sql
immutable
strict
as $$
  select trim(both '-' from
    regexp_replace(
      regexp_replace(
        lower(public.unaccent(v)),
        '[^a-z0-9]+', '-', 'g'
      ),
      '-{2,}', '-', 'g'
    )
  );
$$;

-- -----------------------------------------------------------------------------
-- Helper: código curto público (equivale ao /package/H_JjtxAfwU do referência)
-- Permite URL curta e estável mesmo que o slug mude.
-- -----------------------------------------------------------------------------
create or replace function public.gen_short_code(len int default 10)
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..len loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

-- =============================================================================
-- ENUMS de autorização
-- =============================================================================
create type public.app_role as enum ('super_admin', 'admin', 'customer');

create type public.app_permission as enum (
  'products.read',    'products.write',    'products.delete',
  'categories.read',  'categories.write',  'categories.delete',
  'collections.read', 'collections.write', 'collections.delete',
  'banners.read',     'banners.write',     'banners.delete',
  'homepage.read',    'homepage.write',
  'pages.read',       'pages.write',       'pages.delete',
  'orders.read',      'orders.write',      'orders.refund',
  'customers.read',   'customers.write',
  'reviews.read',     'reviews.moderate',  'reviews.delete',
  'coupons.read',     'coupons.write',     'coupons.delete',
  'inventory.read',   'inventory.write',
  'settings.read',    'settings.write',
  'logs.read',
  'admins.manage'
);

-- =============================================================================
-- PROFILES — espelho público de auth.users
-- =============================================================================
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         citext not null,
  full_name     text,
  avatar_url    text,
  phone         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index profiles_email_idx on public.profiles (email);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- =============================================================================
-- USER_ROLES — quem é o quê
-- =============================================================================
create table public.user_roles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.app_role not null,
  granted_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (user_id, role)
);

create index user_roles_user_id_idx on public.user_roles (user_id);

-- =============================================================================
-- ROLE_PERMISSIONS — o que cada papel pode fazer
-- =============================================================================
create table public.role_permissions (
  id          uuid primary key default gen_random_uuid(),
  role        public.app_role not null,
  permission  public.app_permission not null,
  unique (role, permission)
);

create index role_permissions_role_idx on public.role_permissions (role);

-- admin: acesso operacional completo à loja
insert into public.role_permissions (role, permission)
select 'admin'::public.app_role, p
from unnest(enum_range(null::public.app_permission)) as p
where p <> 'admins.manage';

-- super_admin: tudo, inclusive gerir outros admins
insert into public.role_permissions (role, permission)
select 'super_admin'::public.app_role, p
from unnest(enum_range(null::public.app_permission)) as p;

-- =============================================================================
-- FUNÇÕES DE AUTORIZAÇÃO
-- SECURITY DEFINER porque precisam ler user_roles sem recursão de RLS.
-- search_path travado em '' para impedir sequestro de resolução de nomes.
-- =============================================================================
create or replace function public.has_role(_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role = _role
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid())
      and role in ('admin', 'super_admin')
  );
$$;

create or replace function public.authorize(_permission public.app_permission)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role = ur.role
    where ur.user_id = (select auth.uid())
      and rp.permission = _permission
  );
$$;

revoke execute on function public.has_role(public.app_role) from public;
revoke execute on function public.is_admin() from public;
revoke execute on function public.authorize(public.app_permission) from public;
grant execute on function public.has_role(public.app_role) to authenticated;
grant execute on function public.is_admin() to authenticated, anon;
grant execute on function public.authorize(public.app_permission) to authenticated;

-- =============================================================================
-- BOOTSTRAP DE ADMINS
-- A lista de e-mails que nascem admin vive em tabela, não em código.
-- Quando esse e-mail se cadastrar, o trigger promove automaticamente.
-- =============================================================================
create table public.admin_allowlist (
  email       citext primary key,
  role        public.app_role not null default 'admin',
  note        text,
  created_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Ao criar usuário: cria profile, aplica role de customer e promove se estiver
-- na allowlist. Roda como definer porque auth.users insere fora do contexto RLS.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _allow_role public.app_role;
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'customer')
  on conflict (user_id, role) do nothing;

  select role into _allow_role
  from public.admin_allowlist
  where email = new.email;

  if _allow_role is not null then
    insert into public.user_roles (user_id, role)
    values (new.id, _allow_role)
    on conflict (user_id, role) do nothing;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Mantém profiles.email em sincronia quando o usuário troca de e-mail
-- -----------------------------------------------------------------------------
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();
