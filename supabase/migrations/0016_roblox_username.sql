-- =============================================================================
-- 0016 — USUÁRIO DO ROBLOX NO PEDIDO
-- =============================================================================
-- PROBLEMA: gamepass, Robux e itens são entregues DENTRO do jogo — só que o
-- pedido não guardava para QUEM entregar. O admin recebia o pagamento e tinha
-- de caçar o comprador no Discord/WhatsApp para perguntar o nick, o que trava
-- a entrega e transforma toda venda em atendimento manual.
--
-- Contas de Roblox (onde o cliente RECEBE a credencial) não precisam do nick.
-- Por isso a exigência é POR PRODUTO, não global.
--
-- A validação vive aqui dentro da RPC de propósito: o formulário é conveniência,
-- mas quem monta o POST na mão passaria direto por ele. create_order é o único
-- caminho até a tabela orders, então é aqui que a regra tem de valer.
-- =============================================================================

-- Formato do nick no Roblox: 3 a 20 caracteres, letras/números/underscore, e o
-- underscore nunca nas pontas. Barra e-mail, espaço, link e afins colados no
-- campo errado — erro que só apareceria na hora de entregar.
alter table public.products
  add column if not exists requires_roblox_username boolean not null default false;

comment on column public.products.requires_roblox_username is
  'Pede o nick do Roblox no checkout. Ligue para gamepass/Robux/itens; deixe desligado para venda de conta.';

alter table public.orders
  add column if not exists roblox_username text;

comment on column public.orders.roblox_username is
  'Nick do Roblox que recebe a entrega dentro do jogo. Null quando nenhum item do pedido exige.';

alter table public.orders
  drop constraint if exists orders_roblox_username_format;

alter table public.orders
  add constraint orders_roblox_username_format check (
    roblox_username is null
    or roblox_username ~ '^[A-Za-z0-9][A-Za-z0-9_]{1,18}[A-Za-z0-9]$'
  );

-- Achar "todos os pedidos daquele nick" é a busca que o suporte mais faz.
create index if not exists orders_roblox_username_idx
  on public.orders (roblox_username)
  where roblox_username is not null;

-- -----------------------------------------------------------------------------
-- create_order — agora recebe e valida o nick
-- -----------------------------------------------------------------------------
-- DROP antes de CREATE: acrescentar um parâmetro muda a assinatura, e
-- `create or replace` criaria uma SOBRECARGA em vez de substituir. Duas versões
-- coexistindo deixariam o PostgREST escolher a errada — e a antiga não valida
-- nada do que esta migration introduz.
drop function if exists public.create_order(jsonb, text, text, text, text, uuid, inet, text, text);

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
  p_roblox_username text default null
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
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Carrinho vazio.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'Carrinho excede o limite de 50 itens.' using errcode = 'P0001';
  end if;

  _order_id := gen_random_uuid();
  _roblox := nullif(trim(coalesce(p_roblox_username, '')), '');

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
    -- Nenhum item exige: não guarda nick solto no pedido.
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
    coupon_id, coupon_code, customer_note, ip_address, user_agent, roblox_username
  ) values (
    _order_id, p_user_id, p_customer_email::extensions.citext, p_customer_name, p_customer_phone,
    'pending', 'pending', _subtotal, _discount, _subtotal - _discount,
    _coupon_id, case when _coupon_id is not null then trim(p_coupon_code) end,
    p_customer_note, p_ip, p_user_agent, _roblox
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

revoke all on function public.create_order(jsonb, text, text, text, text, uuid, inet, text, text, text)
  from public, anon, authenticated;
