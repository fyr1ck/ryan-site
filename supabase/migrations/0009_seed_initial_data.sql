-- =============================================================================
-- 0009 — SEED INICIAL
-- =============================================================================
-- Admins, configurações da loja, catálogo de demonstração e homepage montada.
-- Os produtos são fictícios — nada foi copiado de nenhuma loja real.
-- =============================================================================

-- Quem estiver na allowlist vira admin automaticamente ao se cadastrar.
-- Nenhum e-mail é comparado em código: a autorização lê user_roles.
insert into public.admin_allowlist (email, role, note) values
  ('pedro07shopify@gmail.com', 'super_admin', 'Dono da loja'),
  ('armabritanica@gmail.com',  'admin',       'Administrador')
on conflict (email) do nothing;

-- is_public = true  -> pode chegar ao browser
-- is_public = false -> só servidor (nunca serializado para o cliente)
insert into public.settings (key, value, group_name, label, is_public) values
  ('store_name',        '"Roblox Store"',                    'general', 'Nome da loja', true),
  ('store_tagline',     '"Produtos digitais de Roblox com entrega imediata"', 'general', 'Slogan', true),
  ('store_description', '"Contas, gamepasses, itens e Robux com entrega automática e suporte de verdade."', 'general', 'Descrição', true),
  ('logo_url',          '"/placeholders/logo.svg"',          'brand',   'Logo', true),
  ('favicon_url',       '"/favicon.ico"',                    'brand',   'Favicon', true),
  ('primary_color',     '"258 90% 62%"',                     'brand',   'Cor primária (HSL)', true),
  ('contact_email',     '"contato@roblox-store.com.br"',     'contact', 'E-mail de contato', true),
  ('whatsapp_url',      '""',                                'social',  'WhatsApp', true),
  ('instagram_url',     '""',                                'social',  'Instagram', true),
  ('discord_url',       '""',                                'social',  'Discord', true),
  ('youtube_url',       '""',                                'social',  'YouTube', true),
  ('tiktok_url',        '""',                                'social',  'TikTok', true),
  ('seo_title',         '"Roblox Store — Contas, Gamepass e Itens"', 'seo', 'Título SEO padrão', true),
  ('seo_description',   '"Compre contas, gamepasses e itens de Roblox com entrega automática, pagamento via Pix e suporte rápido."', 'seo', 'Descrição SEO padrão', true),
  ('seo_og_image',      '"/placeholders/og.svg"',            'seo',     'Imagem OpenGraph', true),
  ('checkout_terms_url','"/pagina/termos"',                  'checkout','Link dos termos', true),
  ('show_social_proof', 'true',                              'features','Popup de compra recente', true),
  ('show_reviews_home', 'true',                              'features','Depoimentos na home', true),
  ('payment_provider',  '"manual"',                          'payment', 'Gateway ativo', false),
  ('payment_pix_enabled','true',                             'payment', 'Pix habilitado', true),
  ('order_expiration_minutes','30',                          'payment', 'Minutos até expirar o Pix', false)
on conflict (key) do nothing;

-- =============================================================================
-- CATEGORIAS (hierárquicas: raiz em destaque, filhas com carrossel na home)
-- =============================================================================
with roots as (
  insert into public.categories (name, slug, description, image_url, position, is_featured, show_on_home)
  values
    ('Blox Fruits',    'blox-fruits',    'Contas, frutas e gamepasses de Blox Fruits', '/placeholders/cat-blox-fruits.svg', 1, true, false),
    ('Grow a Garden',  'grow-a-garden',  'Sementes, pets e gears',                     '/placeholders/cat-garden.svg',      2, true, false),
    ('Robux',          'robux',          'Robux com entrega automática',               '/placeholders/cat-robux.svg',       3, true, true)
  returning id, slug
)
insert into public.categories (parent_id, name, slug, description, image_url, position, show_on_home)
select r.id, v.name, v.slug, v.description, v.image_url, v.position, v.show_on_home
from roots r
join (values
  ('blox-fruits', 'Contas Blox Fruits',  'contas-blox-fruits',  'Contas prontas com nível alto', '/placeholders/cat-contas.svg',   1, true),
  ('blox-fruits', 'Gamepass',            'gamepass-blox-fruits','Gamepasses oficiais',           '/placeholders/cat-gamepass.svg', 2, true),
  ('grow-a-garden','Sementes',           'sementes',            'Sementes raras',                '/placeholders/cat-sementes.svg', 1, true),
  ('grow-a-garden','Pets',               'pets',                'Pets do jogo',                  '/placeholders/cat-pets.svg',     2, true)
) as v(parent_slug, name, slug, description, image_url, position, show_on_home)
  on v.parent_slug = r.slug;

-- =============================================================================
-- COLEÇÕES (curadoria transversal)
-- =============================================================================
insert into public.collections (name, slug, description, position, show_on_home) values
  ('Mais Vendidos', 'mais-vendidos', 'Os produtos que mais saem da loja', 1, true),
  ('Promoções',     'promocoes',     'Descontos por tempo limitado',      2, true),
  ('Lançamentos',   'lancamentos',   'Novidades recém-chegadas',          3, false)
on conflict (slug) do nothing;

-- =============================================================================
-- PRODUTOS DE DEMONSTRAÇÃO (fictícios)
-- =============================================================================
insert into public.products (
  name, slug, short_description, description, price_cents, compare_at_cents,
  status, category_id, delivery_type, stock_policy, stock_quantity, tags, is_featured, position
) values
  (
    'Conta Blox Fruits — Nível Máximo', 'conta-blox-fruits-nivel-maximo',
    'Conta pronta com nível máximo e raça aleatória',
    '<p>Conta de <strong>Blox Fruits</strong> pronta para jogar no endgame.</p><ul><li>Nível máximo</li><li>Raça aleatória</li><li>Troca de e-mail liberada</li></ul><p>Entrega automática após a confirmação do Pix.</p>',
    6990, 14000, 'active',
    (select id from public.categories where slug = 'contas-blox-fruits'),
    'automatic', 'digital_keys', 0,
    array['conta','blox fruits','nivel maximo'], true, 1
  ),
  (
    'Gamepass — Dark Blade', 'gamepass-dark-blade',
    'Gamepass oficial entregue na sua conta',
    '<p>Gamepass <strong>Dark Blade</strong> creditada diretamente na sua conta do Roblox.</p><p>Basta informar seu usuário após a compra.</p>',
    2990, 4500, 'active',
    (select id from public.categories where slug = 'gamepass-blox-fruits'),
    'manual', 'manual', 25,
    array['gamepass','dark blade'], true, 2
  ),
  (
    '1.000 Robux', 'robux-1000',
    'Robux entregue via gamepass em até 5 dias',
    '<p>Pacote de <strong>1.000 Robux</strong>.</p><p>A entrega é feita pelo método de gamepass, respeitando o prazo de liberação do próprio Roblox.</p>',
    4990, 6500, 'active',
    (select id from public.categories where slug = 'robux'),
    'manual', 'unlimited', 0,
    array['robux'], true, 3
  ),
  (
    'Pack de Sementes Raras', 'pack-sementes-raras',
    'Conjunto com 10 sementes de alto valor',
    '<p>Pack com <strong>10 sementes raras</strong> de Grow a Garden.</p><p>Entrega automática por código.</p>',
    1990, null, 'active',
    (select id from public.categories where slug = 'sementes'),
    'automatic', 'digital_keys', 0,
    array['sementes','grow a garden'], false, 4
  ),
  (
    'Pet Lendário Aleatório', 'pet-lendario-aleatorio',
    'Um pet lendário sorteado do pool',
    '<p>Você recebe <strong>um pet lendário</strong> aleatório do nosso estoque.</p><p>Todos os pets do pool são de raridade lendária.</p>',
    3490, 5000, 'active',
    (select id from public.categories where slug = 'pets'),
    'automatic', 'manual', 12,
    array['pet','lendario'], false, 5
  ),
  (
    'Caixa Surpresa — Frutas', 'caixa-surpresa-frutas',
    'Caixa com fruta permanente garantida',
    '<p><strong>Caixa surpresa</strong> com uma fruta permanente garantida.</p><p>Chance de fruta mítica em cada caixa.</p>',
    990, 2000, 'active',
    (select id from public.categories where slug = 'blox-fruits'),
    'automatic', 'digital_keys', 0,
    array['caixa','fruta','surpresa'], true, 6
  );

insert into public.product_images (product_id, url, alt, position)
select p.id, '/placeholders/product-' || p.position || '.svg', p.name, 0
from public.products p;

-- Chaves de demonstração para os produtos de entrega automática
insert into public.digital_stock_items (product_id, content, content_type)
select p.id, 'DEMO-' || upper(public.gen_short_code(6)) || '-' || g, 'code'
from public.products p
cross join generate_series(1, 8) g
where p.stock_policy = 'digital_keys';

insert into public.collection_products (collection_id, product_id, position)
select c.id, p.id, p.position
from public.collections c, public.products p
where c.slug = 'mais-vendidos' and p.is_featured;

insert into public.collection_products (collection_id, product_id, position)
select c.id, p.id, p.position
from public.collections c, public.products p
where c.slug = 'promocoes' and p.compare_at_cents is not null;

-- =============================================================================
-- HOMEPAGE — seções ordenáveis, todas editáveis no painel
-- =============================================================================
insert into public.homepage_sections (type, title, subtitle, position, collection_id, category_id, product_limit, config) values
  ('hero', null, null, 1, null, null, 8, '{}'::jsonb),
  ('categories', 'Categorias populares', null, 2, null, null, 12, '{}'::jsonb),
  ('collection', 'Mais Vendidos', 'Os queridinhos da loja', 3,
    (select id from public.collections where slug = 'mais-vendidos'), null, 8, '{}'::jsonb),
  ('collection', 'Promoções', 'Descontos por tempo limitado', 4,
    (select id from public.collections where slug = 'promocoes'), null, 8, '{}'::jsonb),
  ('features', 'Por que comprar aqui', null, 5, null, null, 8,
    '{"items":[
      {"icon":"zap","title":"Entrega imediata","text":"Receba seu pedido logo após a confirmação do pagamento."},
      {"icon":"shield-check","title":"Compra segura","text":"Seus dados trafegam criptografados do início ao fim."},
      {"icon":"headphones","title":"Suporte de verdade","text":"Atendimento humano para resolver qualquer problema."}
    ]}'::jsonb),
  ('reviews', 'Depoimentos de clientes', 'Experiências reais de quem já comprou', 6, null, null, 10, '{}'::jsonb),
  ('faq', 'Perguntas frequentes', null, 7, null, null, 8,
    '{"items":[
      {"q":"Em quanto tempo recebo meu pedido?","a":"Produtos com entrega automática são liberados na hora em que o pagamento é confirmado. Entregas manuais saem em até algumas horas."},
      {"q":"Quais formas de pagamento vocês aceitam?","a":"Pix, com aprovação imediata."},
      {"q":"E se der algum problema com o produto?","a":"Fale com o suporte pelo e-mail da loja. Resolvemos ou devolvemos o valor."}
    ]}'::jsonb),
  ('cta', 'Pronto para começar?', 'Escolha seu produto e receba em minutos', 8, null, null, 8,
    '{"link_url":"/produtos","link_label":"Ver todos os produtos"}'::jsonb);

insert into public.banners (title, placement, image_url, image_mobile_url, alt, link_url, position) values
  ('Banner principal', 'home_hero', '/placeholders/banner-desktop.svg', '/placeholders/banner-mobile.svg',
   'Promoções da semana', '/produtos', 1);

-- =============================================================================
-- PÁGINAS INSTITUCIONAIS
-- =============================================================================
insert into public.pages (title, slug, content, is_published, show_in_footer, position) values
  ('Termos e Condições', 'termos',
   '<h2>Termos e Condições</h2><p>Ao comprar nesta loja você concorda com os termos abaixo.</p><h3>Produtos digitais</h3><p>Todos os itens vendidos são digitais e entregues eletronicamente.</p><h3>Reembolso</h3><p>Reembolsos são analisados caso a caso quando o produto não for entregue conforme descrito.</p>',
   true, true, 1),
  ('Política de Privacidade', 'privacidade',
   '<h2>Política de Privacidade</h2><p>Coletamos apenas os dados necessários para processar seu pedido: e-mail, nome e informações de pagamento.</p><p>Não compartilhamos seus dados com terceiros para fins de marketing.</p>',
   true, true, 2),
  ('Sobre Nós', 'sobre',
   '<h2>Sobre Nós</h2><p>Somos uma loja de produtos digitais focada em entrega rápida e atendimento humano.</p>',
   true, true, 3),
  ('Suporte', 'suporte',
   '<h2>Suporte</h2><p>Precisa de ajuda com um pedido? Entre em contato pelo e-mail da loja informando o número do pedido.</p>',
   true, true, 4)
on conflict (slug) do nothing;
