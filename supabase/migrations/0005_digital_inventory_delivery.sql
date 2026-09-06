-- =============================================================================
-- 0005 — ESTOQUE DIGITAL, ENTREGAS, AVALIAÇÕES E LOGS
-- =============================================================================
-- digital_stock_items.content é o dado mais sensível do sistema (códigos,
-- credenciais). O RLS de 0007 bloqueia SELECT para todo mundo exceto admin;
-- o cliente só o alcança pela RPC get_my_delivery(), que revalida o pagamento.
-- =============================================================================

create type public.digital_content_type as enum ('code', 'link', 'file', 'credential', 'text');
create type public.stock_item_status   as enum ('available', 'reserved', 'delivered', 'disabled');

-- Cada linha é UMA unidade vendável (um código, uma credencial, um link)
create table public.digital_stock_items (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products(id) on delete cascade,
  content       text not null,
  content_type  public.digital_content_type not null default 'code',
  status        public.stock_item_status not null default 'available',
  order_item_id uuid references public.order_items(id) on delete set null,
  reserved_at   timestamptz,
  delivered_at  timestamptz,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- Índice parcial: a consulta quente é "próximo item disponível deste produto"
create index digital_stock_available_idx on public.digital_stock_items (product_id, created_at)
  where status = 'available';
create index digital_stock_order_item_idx on public.digital_stock_items (order_item_id);
create trigger digital_stock_set_updated_at before update on public.digital_stock_items
  for each row execute function public.set_updated_at();

-- Trilha de entrega: o que foi entregue, quando, e quando o cliente visualizou
create table public.digital_deliveries (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  stock_item_id uuid references public.digital_stock_items(id) on delete set null,
  -- entrega manual: o admin escreve o conteúdo direto aqui
  manual_content text,
  delivered_by  uuid references auth.users(id) on delete set null,
  delivered_at  timestamptz not null default now(),
  first_viewed_at timestamptz,
  view_count    integer not null default 0
);
create index digital_deliveries_order_idx on public.digital_deliveries (order_id);
create index digital_deliveries_item_idx  on public.digital_deliveries (order_item_id);

-- =============================================================================
-- AVALIAÇÕES
-- =============================================================================
create table public.reviews (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products(id) on delete cascade,
  order_id      uuid references public.orders(id) on delete set null,
  user_id       uuid references auth.users(id) on delete set null,
  customer_name text not null,
  rating        smallint not null check (rating between 1 and 5),
  comment       text,
  is_approved   boolean not null default false,
  is_verified_purchase boolean not null default false,
  admin_reply   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index reviews_product_idx  on public.reviews (product_id, created_at desc);
create index reviews_approved_idx on public.reviews (product_id) where is_approved;
create index reviews_pending_idx  on public.reviews (created_at desc) where not is_approved;
create unique index reviews_unique_per_order on public.reviews (product_id, order_id, user_id)
  where order_id is not null and user_id is not null;
create trigger reviews_set_updated_at before update on public.reviews
  for each row execute function public.set_updated_at();

-- Mantém products.rating_average/rating_count sincronizados.
-- Só avaliações aprovadas contam: reprovar uma review recalcula a média na hora.
create or replace function public.refresh_product_rating()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  _product_id uuid := coalesce(new.product_id, old.product_id);
begin
  update public.products p
  set rating_average = coalesce(agg.avg_rating, 0),
      rating_count   = coalesce(agg.cnt, 0)
  from (
    select avg(rating)::numeric(3,2) as avg_rating, count(*) as cnt
    from public.reviews
    where product_id = _product_id and is_approved
  ) agg
  where p.id = _product_id;
  return null;
end;
$$;

create trigger reviews_refresh_rating
  after insert or update of rating, is_approved or delete on public.reviews
  for each row execute function public.refresh_product_rating();

-- =============================================================================
-- LOGS ADMINISTRATIVOS (append-only por design: sem policy de update/delete)
-- =============================================================================
create table public.admin_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references auth.users(id) on delete set null,
  actor_email text,
  action      text not null,
  entity_type text,
  entity_id   text,
  summary     text,
  metadata    jsonb not null default '{}'::jsonb,
  ip_address  inet,
  created_at  timestamptz not null default now()
);
create index admin_logs_created_idx on public.admin_logs (created_at desc);
create index admin_logs_actor_idx   on public.admin_logs (actor_id, created_at desc);
create index admin_logs_entity_idx  on public.admin_logs (entity_type, entity_id);
