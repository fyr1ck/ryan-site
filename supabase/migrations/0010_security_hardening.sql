-- =============================================================================
-- 0010 — ENDURECIMENTO DE SEGURANÇA
-- =============================================================================
-- Resolve os apontamentos do linter do Supabase:
--   * extensões fora do schema public
--   * search_path fixo em toda função (evita sequestro de resolução de nomes)
--   * funções de trigger não devem ser chamáveis via /rest/v1/rpc
-- =============================================================================

-- 1) Extensões saem do schema public
create schema if not exists extensions;
alter extension citext   set schema extensions;
alter extension pg_trgm  set schema extensions;
alter extension unaccent set schema extensions;

-- 2) search_path fixo + qualificação completa.
--    Sem isso, `::citext` dentro de função com search_path = '' não resolve
--    e o checkout quebra em runtime.
create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.slugify(v text)
returns text language sql immutable strict security invoker set search_path = '' as $$
  select trim(both '-' from
    regexp_replace(
      regexp_replace(lower(extensions.unaccent(v)), '[^a-z0-9]+', '-', 'g'),
      '-{2,}', '-', 'g'
    )
  );
$$;

create or replace function public.gen_short_code(len int default 10)
returns text language plpgsql volatile security invoker set search_path = '' as $$
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

create or replace function public.check_category_cycle()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  _cursor uuid := new.parent_id;
  _depth int := 0;
begin
  while _cursor is not null loop
    if _cursor = new.id then
      raise exception 'Ciclo detectado na hierarquia de categorias';
    end if;
    _depth := _depth + 1;
    if _depth > 10 then
      raise exception 'Hierarquia de categorias excede 10 niveis';
    end if;
    select parent_id into _cursor from public.categories where id = _cursor;
  end loop;
  return new;
end;
$$;

-- O regconfig 'portuguese' sozinho não resolve com search_path = ''
create or replace function public.products_update_search_vector()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.search_vector :=
      setweight(to_tsvector('pg_catalog.portuguese'::regconfig, coalesce(new.name, '')), 'A')
   || setweight(to_tsvector('pg_catalog.portuguese'::regconfig, coalesce(new.short_description, '')), 'B')
   || setweight(to_tsvector('pg_catalog.portuguese'::regconfig, array_to_string(new.tags, ' ')), 'B')
   || setweight(to_tsvector('pg_catalog.portuguese'::regconfig, coalesce(new.description, '')), 'C');
  return new;
end;
$$;

-- 3) Funções que usam citext passam a qualificar como extensions.citext
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  _allow_role public.app_role;
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email::extensions.citext,
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
  where email = new.email::extensions.citext;

  if _allow_role is not null then
    insert into public.user_roles (user_id, role)
    values (new.id, _allow_role)
    on conflict (user_id, role) do nothing;
  end if;

  return new;
end;
$$;

create or replace function public.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email::extensions.citext where id = new.id;
  end if;
  return new;
end;
$$;

create or replace function public.compute_coupon_discount(
  p_code text, p_subtotal_cents integer, p_email text default null, p_user_id uuid default null
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  c public.coupons%rowtype;
  _used_by_customer integer;
  _discount integer;
begin
  select * into c from public.coupons
  where code = p_code::extensions.citext and is_active limit 1;

  if not found then
    return jsonb_build_object('valid', false, 'reason', 'Cupom inexistente ou inativo.', 'discount_cents', 0);
  end if;
  if c.starts_at is not null and now() < c.starts_at then
    return jsonb_build_object('valid', false, 'reason', 'Este cupom ainda nao comecou a valer.', 'discount_cents', 0);
  end if;
  if c.expires_at is not null and now() > c.expires_at then
    return jsonb_build_object('valid', false, 'reason', 'Este cupom expirou.', 'discount_cents', 0);
  end if;
  if c.usage_limit is not null and c.usage_count >= c.usage_limit then
    return jsonb_build_object('valid', false, 'reason', 'Este cupom atingiu o limite de usos.', 'discount_cents', 0);
  end if;
  if p_subtotal_cents < c.minimum_order_cents then
    return jsonb_build_object('valid', false,
      'reason', 'Pedido minimo de R$ ' || to_char(c.minimum_order_cents / 100.0, 'FM999999990.00') || ' para usar este cupom.',
      'discount_cents', 0);
  end if;

  if p_user_id is not null or p_email is not null then
    select count(*) into _used_by_customer
    from public.coupon_redemptions r
    where r.coupon_id = c.id
      and (
        (p_user_id is not null and r.user_id = p_user_id)
        or (p_user_id is null and p_email is not null and r.email = p_email::extensions.citext)
      );
    if _used_by_customer >= c.per_customer_limit then
      return jsonb_build_object('valid', false, 'reason', 'Voce ja usou este cupom.', 'discount_cents', 0);
    end if;
  end if;

  if c.type = 'percentage' then
    _discount := floor(p_subtotal_cents * c.value / 100.0)::integer;
  else
    _discount := floor(c.value * 100)::integer;
  end if;

  if c.maximum_discount_cents is not null then
    _discount := least(_discount, c.maximum_discount_cents);
  end if;
  _discount := least(_discount, p_subtotal_cents);

  return jsonb_build_object('valid', true, 'reason', null, 'discount_cents', _discount,
                            'coupon_id', c.id, 'code', c.code);
end;
$$;

-- 4) Funções de trigger não devem ser chamáveis via /rest/v1/rpc.
--    Revogar EXECUTE não afeta os triggers (que rodam com o privilégio do owner).
revoke all on function public.handle_new_user()               from public, anon, authenticated;
revoke all on function public.handle_user_email_change()      from public, anon, authenticated;
revoke all on function public.refresh_product_rating()        from public, anon, authenticated;
revoke all on function public.check_category_cycle()          from public, anon, authenticated;
revoke all on function public.products_update_search_vector() from public, anon, authenticated;
revoke all on function public.set_updated_at()                from public, anon, authenticated;

-- is_admin não precisa ser alcançável por visitante anônimo
revoke all on function public.is_admin() from anon;
grant execute on function public.is_admin() to authenticated;
