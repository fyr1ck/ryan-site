-- =============================================================================
-- 0003 — CMS: banners, seções da homepage, páginas e configurações
-- =============================================================================
-- A homepage não é hardcoded: ela é uma lista ordenável de seções tipadas.
-- settings.is_public separa o que pode chegar ao browser do que é só servidor.
-- =============================================================================

create type public.banner_placement as enum ('home_hero', 'home_middle', 'category_top', 'sidebar');

create table public.banners (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  placement       public.banner_placement not null default 'home_hero',
  image_url       text not null,
  image_mobile_url text,
  alt             text,
  link_url        text,
  open_in_new_tab boolean not null default false,
  position        integer not null default 0,
  is_active       boolean not null default true,
  starts_at       timestamptz,
  ends_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint banners_window_valid check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index banners_placement_idx on public.banners (placement, position) where is_active;
create trigger banners_set_updated_at before update on public.banners
  for each row execute function public.set_updated_at();

create type public.section_type as enum (
  'hero', 'banner', 'categories', 'collection', 'products',
  'text', 'faq', 'reviews', 'cta', 'features'
);

create table public.homepage_sections (
  id             uuid primary key default gen_random_uuid(),
  type           public.section_type not null,
  title          text,
  subtitle       text,
  image_url      text,
  link_url       text,
  link_label     text,
  collection_id  uuid references public.collections(id) on delete set null,
  category_id    uuid references public.categories(id) on delete set null,
  product_limit  integer not null default 8 check (product_limit between 1 and 50),
  -- payload livre por tipo (itens de FAQ, features, blocos de texto)
  config         jsonb not null default '{}'::jsonb,
  position       integer not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index homepage_sections_position_idx on public.homepage_sections (position) where is_active;
create trigger homepage_sections_set_updated_at before update on public.homepage_sections
  for each row execute function public.set_updated_at();

create table public.pages (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  slug            text not null unique,
  content         text,
  excerpt         text,
  seo_title       text,
  seo_description text,
  is_published    boolean not null default false,
  show_in_footer  boolean not null default false,
  position        integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index pages_slug_idx on public.pages (slug);
create index pages_published_idx on public.pages (is_published) where is_published;
create trigger pages_set_updated_at before update on public.pages
  for each row execute function public.set_updated_at();

create table public.settings (
  key         text primary key,
  value       jsonb not null default 'null'::jsonb,
  group_name  text not null default 'general',
  label       text,
  is_public   boolean not null default false,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);
create index settings_group_idx on public.settings (group_name);
create index settings_public_idx on public.settings (is_public) where is_public;
create trigger settings_set_updated_at before update on public.settings
  for each row execute function public.set_updated_at();
