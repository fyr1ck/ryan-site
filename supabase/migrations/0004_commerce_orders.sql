-- =============================================================================
-- 0004 — COMÉRCIO: cupons, pedidos, itens, pagamentos
-- =============================================================================
-- order_items guarda um SNAPSHOT do produto (nome, preço, imagem). Se o produto
-- for editado ou excluído depois, o histórico do pedido continua correto.
-- =============================================================================

create type public.order_status as enum (
  'pending', 'paid', 'processing', 'completed', 'cancelled', 'refunded'
);
create type public.payment_status as enum (
  'pending', 'authorized', 'paid', 'failed', 'expired', 'refunded', 'chargeback'
);
create type public.coupon_type as enum ('percentage', 'fixed');

-- Número legível para o cliente (#1001), separado do UUID interno
create sequence public.order_number_seq start with 1000 increment by 1;

create table public.coupons (
  id                uuid primary key default gen_random_uuid(),
  code              citext not null unique,
  description       text,
  type              public.coupon_type not null default 'percentage',
  value             numeric(10,2) not null check (value > 0),
  minimum_order_cents integer not null default 0 check (minimum_order_cents >= 0),
  maximum_discount_cents integer check (maximum_discount_cents > 0),
  usage_limit       integer check (usage_limit > 0),
  usage_count       integer not null default 0 check (usage_count >= 0),
  per_customer_limit integer not null default 1 check (per_customer_limit > 0),
  starts_at         timestamptz,
  expires_at        timestamptz,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint coupons_percentage_max check (type <> 'percentage' or value <= 100),
  constraint coupons_window_valid check (expires_at is null or starts_at is null or expires_at > starts_at)
);
create index coupons_code_idx on public.coupons (code) where is_active;
create trigger coupons_set_updated_at before update on public.coupons
  for each row execute function public.set_updated_at();

create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  order_number      integer not null unique default nextval('public.order_number_seq'),
  user_id           uuid references auth.users(id) on delete set null,
  -- snapshot do comprador: o pedido sobrevive à exclusão da conta
  customer_email    citext not null,
  customer_name     text,
  customer_phone    text,
  status            public.order_status   not null default 'pending',
  payment_status    public.payment_status not null default 'pending',
  subtotal_cents    integer not null check (subtotal_cents >= 0),
  discount_cents    integer not null default 0 check (discount_cents >= 0),
  total_cents       integer not null check (total_cents >= 0),
  coupon_id         uuid references public.coupons(id) on delete set null,
  coupon_code       text,
  customer_note     text,
  admin_note        text,
  ip_address        inet,
  user_agent        text,
  paid_at           timestamptz,
  completed_at      timestamptz,
  cancelled_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint orders_total_matches check (total_cents = subtotal_cents - discount_cents)
);
create index orders_user_id_idx on public.orders (user_id);
create index orders_email_idx   on public.orders (customer_email);
create index orders_status_idx  on public.orders (status);
create index orders_created_idx on public.orders (created_at desc);
create trigger orders_set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

create table public.order_items (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders(id) on delete cascade,
  product_id        uuid references public.products(id) on delete set null,
  product_name      text not null,
  product_slug      text,
  product_image_url text,
  unit_price_cents  integer not null check (unit_price_cents >= 0),
  quantity          integer not null check (quantity > 0),
  total_cents       integer not null check (total_cents >= 0),
  created_at        timestamptz not null default now()
);
create index order_items_order_id_idx   on public.order_items (order_id);
create index order_items_product_id_idx on public.order_items (product_id);

create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id) on delete cascade,
  provider            text not null default 'manual',
  provider_payment_id text,
  method              text not null default 'pix',
  status              public.payment_status not null default 'pending',
  amount_cents        integer not null check (amount_cents >= 0),
  -- payload do gateway fica no servidor; nunca é exposto ao cliente
  qr_code             text,
  qr_code_text        text,
  expires_at          timestamptz,
  paid_at             timestamptz,
  raw_payload         jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index payments_order_id_idx on public.payments (order_id);
create unique index payments_provider_id_idx on public.payments (provider, provider_payment_id)
  where provider_payment_id is not null;
create trigger payments_set_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

create table public.coupon_redemptions (
  id          uuid primary key default gen_random_uuid(),
  coupon_id   uuid not null references public.coupons(id) on delete cascade,
  order_id    uuid not null references public.orders(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  email       citext,
  discount_cents integer not null check (discount_cents >= 0),
  created_at  timestamptz not null default now(),
  unique (coupon_id, order_id)
);
create index coupon_redemptions_coupon_idx on public.coupon_redemptions (coupon_id);
create index coupon_redemptions_email_idx  on public.coupon_redemptions (coupon_id, email);
