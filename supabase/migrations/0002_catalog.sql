-- =============================================================================
-- 0002 — CATÁLOGO: categorias hierárquicas, produtos, imagens, coleções
-- =============================================================================
-- Decisões:
--  * Dinheiro em CENTAVOS (integer). Nunca float — evita erro de arredondamento.
--  * Produto tem slug (SEO) E short_code (URL curta e estável, como o
--    /package/H_JjtxAfwU do site de referência). Slug pode mudar; código não.
--  * categories é hierárquica (parent_id) porque o referência agrupa
--    "BLOX FRUITS" > "CONTAS PREMIUM". collections é curadoria transversal.
--  * Produto pertence a 1 categoria principal + N categorias secundárias (M2M).
-- =============================================================================

create type public.product_status as enum ('draft', 'active', 'archived');
create type public.delivery_type  as enum ('automatic', 'manual');
create type public.stock_policy   as enum ('unlimited', 'manual', 'digital_keys');

-- =============================================================================
-- CATEGORIAS
-- =============================================================================
create table public.categories (
  id            uuid primary key default gen_random_uuid(),
  parent_id     uuid references public.categories(id) on delete set null,
  name          text not null,
  slug          text not null unique,
  description   text,
  image_url     text,
  banner_url    text,
  position      integer not null default 0,
  is_active     boolean not null default true,
  -- aparece no bloco "Categorias populares" da home
  is_featured   boolean not null default false,
  -- renderiza um carrossel próprio na home (como as seções do referência)
  show_on_home  boolean not null default false,
  seo_title     text,
  seo_description text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint categories_no_self_parent check (id <> parent_id)
);

create index categories_parent_id_idx on public.categories (parent_id);
create index categories_position_idx  on public.categories (position);
create index categories_active_idx    on public.categories (is_active) where is_active;

create trigger categories_set_updated_at before update on public.categories
  for each row execute function public.set_updated_at();

-- Impede ciclos na árvore (A -> B -> A), que travariam o menu recursivo
create or replace function public.check_category_cycle()
returns trigger language plpgsql as $$
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
      raise exception 'Hierarquia de categorias excede 10 níveis';
    end if;
    select parent_id into _cursor from public.categories where id = _cursor;
  end loop;
  return new;
end;
$$;

create trigger categories_check_cycle
  before insert or update of parent_id on public.categories
  for each row when (new.parent_id is not null)
  execute function public.check_category_cycle();

-- =============================================================================
-- PRODUTOS
-- =============================================================================
create table public.products (
  id                uuid primary key default gen_random_uuid(),
  short_code        text not null unique default public.gen_short_code(10),
  name              text not null,
  slug              text not null unique,
  short_description text,
  description       text,                    -- HTML sanitizado no servidor
  price_cents       integer not null check (price_cents >= 0),
  compare_at_cents  integer check (compare_at_cents >= 0),
  cost_cents        integer check (cost_cents >= 0),
  sku               text unique,
  status            public.product_status not null default 'draft',
  category_id       uuid references public.categories(id) on delete set null,
  delivery_type     public.delivery_type not null default 'automatic',
  stock_policy      public.stock_policy   not null default 'manual',
  stock_quantity    integer not null default 0 check (stock_quantity >= 0),
  stock_reserved    integer not null default 0 check (stock_reserved >= 0),
  tags              text[] not null default '{}',
  is_featured       boolean not null default false,
  position          integer not null default 0,
  -- desnormalizados: lidos em toda listagem, atualizados por trigger
  sales_count       integer not null default 0 check (sales_count >= 0),
  rating_average    numeric(3,2) not null default 0,
  rating_count      integer not null default 0,
  seo_title         text,
  seo_description   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- promoção só existe se o preço "de" for maior que o "por"
  constraint products_compare_gt_price
    check (compare_at_cents is null or compare_at_cents > price_cents)
);

create index products_status_idx      on public.products (status) where status = 'active';
create index products_category_id_idx on public.products (category_id);
create index products_slug_idx        on public.products (slug);
create index products_short_code_idx  on public.products (short_code);
create index products_featured_idx    on public.products (is_featured) where is_featured;
create index products_tags_idx        on public.products using gin (tags);
create index products_name_trgm_idx   on public.products using gin (name gin_trgm_ops);
create index products_price_idx       on public.products (price_cents);
create index products_sales_idx       on public.products (sales_count desc);

create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();

-- Busca full-text em português, mantida por trigger (nome + descrição + tags)
alter table public.products add column search_vector tsvector;

create or replace function public.products_update_search_vector()
returns trigger language plpgsql as $$
begin
  new.search_vector :=
      setweight(to_tsvector('portuguese', coalesce(new.name, '')), 'A')
   || setweight(to_tsvector('portuguese', coalesce(new.short_description, '')), 'B')
   || setweight(to_tsvector('portuguese', array_to_string(new.tags, ' ')), 'B')
   || setweight(to_tsvector('portuguese', coalesce(new.description, '')), 'C');
  return new;
end;
$$;

create trigger products_search_vector_update
  before insert or update of name, short_description, description, tags
  on public.products
  for each row execute function public.products_update_search_vector();

create index products_search_idx on public.products using gin (search_vector);

-- =============================================================================
-- IMAGENS DO PRODUTO (galeria ordenável)
-- =============================================================================
create table public.product_images (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  url         text not null,
  alt         text,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

create index product_images_product_id_idx on public.product_images (product_id, position);

-- =============================================================================
-- PRODUTO x CATEGORIA (secundárias) — um produto aparece em vários carrosséis
-- =============================================================================
create table public.product_categories (
  product_id  uuid not null references public.products(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  position    integer not null default 0,
  primary key (product_id, category_id)
);

create index product_categories_category_idx on public.product_categories (category_id, position);

-- =============================================================================
-- COLEÇÕES (curadoria transversal: "Mais vendidos", "Promoções")
-- =============================================================================
create table public.collections (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,
  description   text,
  image_url     text,
  banner_url    text,
  position      integer not null default 0,
  is_active     boolean not null default true,
  show_on_home  boolean not null default false,
  seo_title     text,
  seo_description text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index collections_position_idx on public.collections (position);
create index collections_active_idx   on public.collections (is_active) where is_active;

create trigger collections_set_updated_at before update on public.collections
  for each row execute function public.set_updated_at();

create table public.collection_products (
  collection_id uuid not null references public.collections(id) on delete cascade,
  product_id    uuid not null references public.products(id) on delete cascade,
  position      integer not null default 0,
  primary key (collection_id, product_id)
);

create index collection_products_collection_idx on public.collection_products (collection_id, position);
create index collection_products_product_idx    on public.collection_products (product_id);
