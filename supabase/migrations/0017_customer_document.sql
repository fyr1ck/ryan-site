-- =============================================================================
-- 0017 — CPF DO COMPRADOR NO PEDIDO
-- =============================================================================
-- A troca de gateway (Stripe -> MisticPay) trouxe um requisito novo: a API de
-- criação da cobrança Pix exige `payerDocument`. Sem CPF nenhuma venda fecha.
--
-- ONDE CADA VALIDAÇÃO VIVE, e por quê:
--   - FORMATO (11 dígitos, não todos iguais) fica aqui, no banco. É invariante
--     do dado: um CPF com 9 dígitos é lixo em qualquer cenário.
--   - DÍGITO VERIFICADOR fica na Server Action (src/lib/cpf.ts). O algoritmo da
--     Receita em plpgsql seria uma reimplementação a mais para manter, e o
--     ganho é nulo: a RPC só é chamada pelo servidor, nunca pelo cliente.
--   - OBRIGATORIEDADE fica na action, não como NOT NULL. Exigir CPF é regra do
--     GATEWAY, não da loja — os pedidos que já existem não têm CPF, e um
--     gateway futuro pode não pedir. NOT NULL travaria a migration hoje e
--     amarraria o schema a uma decisão que não é dele.
-- =============================================================================

alter table public.orders
  add column if not exists customer_document text;

comment on column public.orders.customer_document is
  'CPF do pagador, so digitos. Exigido pela API do gateway de Pix na criacao da cobranca.';

alter table public.orders
  drop constraint if exists orders_customer_document_format;

alter table public.orders
  add constraint orders_customer_document_format check (
    customer_document is null
    or (customer_document ~ '^[0-9]{11}$' and customer_document !~ '^(.)\1{10}$')
  );

-- -----------------------------------------------------------------------------
-- create_order — agora recebe e guarda o CPF
-- -----------------------------------------------------------------------------
-- DROP antes de CREATE pelo mesmo motivo da 0016: acrescentar parâmetro cria
-- sobrecarga em vez de substituir, e duas versões coexistindo deixariam o
-- PostgREST escolher a errada.
drop function if exists public.create_order(jsonb, text, text, text, text, uuid, inet, text, text, text);

create or replace function public.create_order(
  p_items jsonb,
  p_customer_email text,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_coupon_code text default null,
  p_user_id uuid default null,
  p_ip inet default null,
  p_user_agent text default null,
  p_customer_note text default null,
  p_roblox_username text default null,
  p_customer_document text default null
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  _item jsonb; _product public.products%rowtype; _qty integer;
  _subtotal integer := 0; _discount integer := 0;
  _coupon jsonb; _coupon_id uuid;
  _order_id uuid; _order_number integer; _order_item_id uuid;
  _reserved integer; _image_url text;
  _needs_roblox boolean := false;
  _roblox text;
  _documento text;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Carrinho vazio.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'Carrinho excede o limite de 50 itens.' using errcode = 'P0001';
  end if;

  _order_id := gen_random_uuid();
  _roblox := nullif(trim(coalesce(p_roblox_username, '')), '');

  -- Aceita CPF com máscara e guarda só os dígitos: a API do gateway recusa
  -- pontuação, e gravar nos dois formatos quebraria qualquer busca por CPF.
  _documento := nullif(regexp_replace(coalesce(p_customer_document, ''), '[^0-9]', '', 'g'), '');

  if _documento is not null and _documento !~ '^[0-9]{11}$' then
    raise exception 'CPF invalido.' using errcode = 'P0001';
  end if;

  -- 1ª passada: valida produtos e calcula subtotal com o preço do banco
  for _item in select * from jsonb_array_elements(p_items) loop
    _qty := greatest(coalesce((_item ->> 'quantity')::integer, 1), 1);
    if _qty > 100 then
      raise exception 'Quantidade maxima por item e 100.' using errcode = 'P0001';
    end if;

    select * into _product from public.products
    where id = (_item ->> 'product_id')::uuid and status = 'active'
    for update;

    if not found then
      raise exception 'Produto indisponivel ou inexistente.' using errcode = 'P0001';
    end if;

    if _product.requires_roblox_username then
      _needs_roblox := true;
    end if;

    _subtotal := _subtotal + (_product.price_cents * _qty);
  end loop;

  -- Exigência do nick: decidida pelos produtos do carrinho, nunca pelo cliente.
  if _needs_roblox then
    if _roblox is null then
      raise exception 'Informe o seu usuario do Roblox para receber a entrega.'
        using errcode = 'P0001';
    end if;

    if _roblox !~ '^[A-Za-z0-9][A-Za-z0-9_]{1,18}[A-Za-z0-9]$' then
      raise exception 'Usuario do Roblox invalido. Use de 3 a 20 caracteres, apenas letras, numeros e _.'
        using errcode = 'P0001';
    end if;
  else
    _roblox := null;
  end if;

  if p_coupon_code is not null and length(trim(p_coupon_code)) > 0 then
    _coupon := public.compute_coupon_discount(trim(p_coupon_code), _subtotal, p_customer_email, p_user_id);
    if (_coupon ->> 'valid')::boolean then
      _discount  := (_coupon ->> 'discount_cents')::integer;
      _coupon_id := (_coupon ->> 'coupon_id')::uuid;
    else
      raise exception '%', (_coupon ->> 'reason') using errcode = 'P0001';
    end if;
  end if;

  insert into public.orders (
    id, user_id, customer_email, customer_name, customer_phone,
    status, payment_status, subtotal_cents, discount_cents, total_cents,
    coupon_id, coupon_code, customer_note, ip_address, user_agent,
    roblox_username, customer_document
  ) values (
    _order_id, p_user_id, p_customer_email::extensions.citext, p_customer_name, p_customer_phone,
    'pending', 'pending', _subtotal, _discount, _subtotal - _discount,
    _coupon_id, case when _coupon_id is not null then trim(p_coupon_code) end,
    p_customer_note, p_ip, p_user_agent,
    _roblox, _documento
  )
  returning order_number into _order_number;

  -- 2ª passada: cria os itens (snapshot) e reserva estoque
  for _item in select * from jsonb_array_elements(p_items) loop
    _qty := greatest(coalesce((_item ->> 'quantity')::integer, 1), 1);

    select * into _product from public.products
    where id = (_item ->> 'product_id')::uuid and status = 'active';

    select url into _image_url from public.product_images
    where product_id = _product.id order by position, created_at limit 1;

    insert into public.order_items (
      order_id, product_id, product_name, product_slug, product_image_url,
      unit_price_cents, quantity, total_cents
    ) values (
      _order_id, _product.id, _product.name, _product.slug, _image_url,
      _product.price_cents, _qty, _product.price_cents * _qty
    ) returning id into _order_item_id;

    if _product.stock_policy = 'manual' then
      update public.products
      set stock_reserved = stock_reserved + _qty
      where id = _product.id and (stock_quantity - stock_reserved) >= _qty;

      if not found then
        raise exception 'Estoque insuficiente para "%".', _product.name using errcode = 'P0001';
      end if;

    elsif _product.stock_policy = 'digital_keys' then
      with picked as (
        select id from public.digital_stock_items
        where product_id = _product.id and status = 'available'
        order by created_at limit _qty
        for update skip locked
      )
      update public.digital_stock_items s
      set status = 'reserved', reserved_at = now(), order_item_id = _order_item_id
      from picked where s.id = picked.id;

      get diagnostics _reserved = row_count;

      if _reserved < _qty then
        raise exception 'Estoque insuficiente para "%". Restam % unidade(s).',
          _product.name, _reserved using errcode = 'P0001';
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'order_id', _order_id, 'order_number', _order_number,
    'subtotal_cents', _subtotal, 'discount_cents', _discount,
    'total_cents', _subtotal - _discount
  );
end;
$$;

revoke all on function public.create_order(jsonb, text, text, text, text, uuid, inet, text, text, text, text)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- CPF é dado pessoal (LGPD) e não é exibido em tela nenhuma: só existe para ser
-- enviado ao gateway na criação da cobrança. O que não trafega não vaza.
--
-- Mesmo padrão já aplicado em payments.raw_payload (migration 0007).
--
-- ATENÇÃO A QUEM FOR MEXER: RLS filtra LINHA, este revoke filtra COLUNA. Um
-- `select('*')` em orders feito com o client de sessão (anon/authenticated)
-- passa a falhar com "permission denied for column customer_document" — não
-- volta null, FALHA. Hoje nenhum existe: as telas listam colunas explicitamente
-- e getOrderForViewer usa o client service_role, que ignora grants. Se precisar
-- de `*`, use o client admin ou liste as colunas.
-- -----------------------------------------------------------------------------
revoke select (customer_document) on public.orders from anon, authenticated;
