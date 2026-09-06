-- =============================================================================
-- 0007 — ROW LEVEL SECURITY
-- =============================================================================
-- Princípios:
--   * Toda tabela do schema public tem RLS. Sem exceção "porque o backend cuida".
--   * O público anônimo só enxerga o que está publicado (produto ativo, página
--     publicada, avaliação aprovada, configuração marcada como pública).
--   * O cliente logado só enxerga o que é dele.
--   * O admin passa por authorize(permissão), que consulta role_permissions.
--   * O conteúdo digital não é legível por ninguém além do admin: o cliente
--     recebe pela RPC get_my_delivery(), que revalida pagamento e propriedade.
-- =============================================================================

alter table public.profiles             enable row level security;
alter table public.user_roles           enable row level security;
alter table public.role_permissions     enable row level security;
alter table public.admin_allowlist      enable row level security;
alter table public.categories           enable row level security;
alter table public.products             enable row level security;
alter table public.product_images       enable row level security;
alter table public.product_categories   enable row level security;
alter table public.collections          enable row level security;
alter table public.collection_products  enable row level security;
alter table public.banners              enable row level security;
alter table public.homepage_sections    enable row level security;
alter table public.pages                enable row level security;
alter table public.settings             enable row level security;
alter table public.coupons              enable row level security;
alter table public.orders               enable row level security;
alter table public.order_items          enable row level security;
alter table public.payments             enable row level security;
alter table public.coupon_redemptions   enable row level security;
alter table public.digital_stock_items  enable row level security;
alter table public.digital_deliveries   enable row level security;
alter table public.reviews              enable row level security;
alter table public.admin_logs           enable row level security;

-- =============================================================================
-- PERFIS E PAPÉIS
-- =============================================================================
create policy "profiles_select_own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "profiles_admin_all" on public.profiles
  for all to authenticated using (public.authorize('customers.read'))
  with check (public.authorize('customers.write'));

create policy "user_roles_select_own" on public.user_roles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "user_roles_admin_read" on public.user_roles
  for select to authenticated using (public.authorize('customers.read'));
-- Só quem tem admins.manage (super_admin) muda papéis. Um admin não se promove.
create policy "user_roles_super_write" on public.user_roles
  for all to authenticated using (public.authorize('admins.manage'))
  with check (public.authorize('admins.manage'));

create policy "role_permissions_read" on public.role_permissions
  for select to authenticated using (true);
create policy "role_permissions_super_write" on public.role_permissions
  for all to authenticated using (public.authorize('admins.manage'))
  with check (public.authorize('admins.manage'));

create policy "admin_allowlist_super" on public.admin_allowlist
  for all to authenticated using (public.authorize('admins.manage'))
  with check (public.authorize('admins.manage'));

-- =============================================================================
-- CATÁLOGO — leitura pública só do que está publicado
-- =============================================================================
create policy "categories_public_read" on public.categories
  for select to anon, authenticated using (is_active);
create policy "categories_admin_read_all" on public.categories
  for select to authenticated using (public.authorize('categories.read'));
create policy "categories_admin_write" on public.categories
  for insert to authenticated with check (public.authorize('categories.write'));
create policy "categories_admin_update" on public.categories
  for update to authenticated using (public.authorize('categories.write'))
  with check (public.authorize('categories.write'));
create policy "categories_admin_delete" on public.categories
  for delete to authenticated using (public.authorize('categories.delete'));

create policy "products_public_read" on public.products
  for select to anon, authenticated using (status = 'active');
create policy "products_admin_read_all" on public.products
  for select to authenticated using (public.authorize('products.read'));
create policy "products_admin_write" on public.products
  for insert to authenticated with check (public.authorize('products.write'));
create policy "products_admin_update" on public.products
  for update to authenticated using (public.authorize('products.write'))
  with check (public.authorize('products.write'));
create policy "products_admin_delete" on public.products
  for delete to authenticated using (public.authorize('products.delete'));

-- Imagem só é pública se o produto pai for público
create policy "product_images_public_read" on public.product_images
  for select to anon, authenticated using (
    exists (select 1 from public.products p where p.id = product_id and p.status = 'active')
  );
create policy "product_images_admin" on public.product_images
  for all to authenticated using (public.authorize('products.read'))
  with check (public.authorize('products.write'));

create policy "product_categories_public_read" on public.product_categories
  for select to anon, authenticated using (
    exists (select 1 from public.products p where p.id = product_id and p.status = 'active')
  );
create policy "product_categories_admin" on public.product_categories
  for all to authenticated using (public.authorize('products.read'))
  with check (public.authorize('products.write'));

create policy "collections_public_read" on public.collections
  for select to anon, authenticated using (is_active);
create policy "collections_admin_read_all" on public.collections
  for select to authenticated using (public.authorize('collections.read'));
create policy "collections_admin_write" on public.collections
  for insert to authenticated with check (public.authorize('collections.write'));
create policy "collections_admin_update" on public.collections
  for update to authenticated using (public.authorize('collections.write'))
  with check (public.authorize('collections.write'));
create policy "collections_admin_delete" on public.collections
  for delete to authenticated using (public.authorize('collections.delete'));

create policy "collection_products_public_read" on public.collection_products
  for select to anon, authenticated using (
    exists (select 1 from public.collections c where c.id = collection_id and c.is_active)
  );
create policy "collection_products_admin" on public.collection_products
  for all to authenticated using (public.authorize('collections.read'))
  with check (public.authorize('collections.write'));

-- =============================================================================
-- CONTEÚDO
-- =============================================================================
-- Banner respeita a janela de agendamento: fora dela, nem o anônimo vê.
create policy "banners_public_read" on public.banners
  for select to anon, authenticated using (
    is_active
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
  );
create policy "banners_admin_read_all" on public.banners
  for select to authenticated using (public.authorize('banners.read'));
create policy "banners_admin_write" on public.banners
  for all to authenticated using (public.authorize('banners.write'))
  with check (public.authorize('banners.write'));

create policy "homepage_sections_public_read" on public.homepage_sections
  for select to anon, authenticated using (is_active);
create policy "homepage_sections_admin" on public.homepage_sections
  for all to authenticated using (public.authorize('homepage.read'))
  with check (public.authorize('homepage.write'));

create policy "pages_public_read" on public.pages
  for select to anon, authenticated using (is_published);
create policy "pages_admin_read_all" on public.pages
  for select to authenticated using (public.authorize('pages.read'));
create policy "pages_admin_write" on public.pages
  for all to authenticated using (public.authorize('pages.write'))
  with check (public.authorize('pages.write'));

-- Só as configurações marcadas como públicas chegam ao browser
create policy "settings_public_read" on public.settings
  for select to anon, authenticated using (is_public);
create policy "settings_admin_read_all" on public.settings
  for select to authenticated using (public.authorize('settings.read'));
create policy "settings_admin_write" on public.settings
  for all to authenticated using (public.authorize('settings.write'))
  with check (public.authorize('settings.write'));

-- =============================================================================
-- PEDIDOS — o cliente só enxerga o que é dele
-- =============================================================================
create policy "orders_select_own" on public.orders
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "orders_admin_read" on public.orders
  for select to authenticated using (public.authorize('orders.read'));
create policy "orders_admin_write" on public.orders
  for update to authenticated using (public.authorize('orders.write'))
  with check (public.authorize('orders.write'));

create policy "order_items_select_own" on public.order_items
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))
  );
create policy "order_items_admin_read" on public.order_items
  for select to authenticated using (public.authorize('orders.read'));

create policy "payments_select_own" on public.payments
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))
  );
create policy "payments_admin_read" on public.payments
  for select to authenticated using (public.authorize('orders.read'));

-- RLS é por LINHA; raw_payload precisa de corte por COLUNA.
-- O payload bruto do gateway nunca é selecionável pelo cliente.
revoke select (raw_payload) on public.payments from anon, authenticated;

create policy "coupon_redemptions_admin" on public.coupon_redemptions
  for select to authenticated using (public.authorize('coupons.read'));

-- O cliente NUNCA lista cupons (isso permitiria varrer códigos válidos).
-- A validação passa só pela RPC server-side.
create policy "coupons_admin_read" on public.coupons
  for select to authenticated using (public.authorize('coupons.read'));
create policy "coupons_admin_write" on public.coupons
  for all to authenticated using (public.authorize('coupons.write'))
  with check (public.authorize('coupons.write'));

-- =============================================================================
-- ESTOQUE DIGITAL — conteúdo secreto, admin apenas
-- =============================================================================
create policy "digital_stock_admin_only" on public.digital_stock_items
  for all to authenticated using (public.authorize('inventory.read'))
  with check (public.authorize('inventory.write'));

create policy "digital_deliveries_admin" on public.digital_deliveries
  for select to authenticated using (public.authorize('orders.read'));

-- =============================================================================
-- AVALIAÇÕES
-- =============================================================================
create policy "reviews_public_read_approved" on public.reviews
  for select to anon, authenticated using (is_approved);
create policy "reviews_select_own" on public.reviews
  for select to authenticated using ((select auth.uid()) = user_id);
-- Só avalia quem comprou e teve o pedido pago. E nasce sempre não aprovada.
create policy "reviews_insert_own_purchase" on public.reviews
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and is_approved = false
    and exists (
      select 1 from public.orders o
      join public.order_items oi on oi.order_id = o.id
      where o.user_id = (select auth.uid())
        and oi.product_id = reviews.product_id
        and o.payment_status = 'paid'
    )
  );
create policy "reviews_admin_read_all" on public.reviews
  for select to authenticated using (public.authorize('reviews.read'));
create policy "reviews_admin_moderate" on public.reviews
  for update to authenticated using (public.authorize('reviews.moderate'))
  with check (public.authorize('reviews.moderate'));
create policy "reviews_admin_delete" on public.reviews
  for delete to authenticated using (public.authorize('reviews.delete'));

-- =============================================================================
-- LOGS — leitura para quem tem logs.read.
-- Não existe policy de update nem delete: log é append-only por design.
-- =============================================================================
create policy "admin_logs_read" on public.admin_logs
  for select to authenticated using (public.authorize('logs.read'));
