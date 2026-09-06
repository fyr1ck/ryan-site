-- =============================================================================
-- 0011 — CORREÇÃO: qualificar citext em create_order e get_my_delivery
-- =============================================================================
-- Estas duas funções ficaram de fora da 0010 e continuavam com `::citext` sem
-- schema. Como rodam com search_path = '', o tipo não resolvia e o checkout
-- falhava com "type citext does not exist" — pego por teste antes do deploy.
-- =============================================================================

create or replace function public.create_order(
  p_items jsonb,
  p_customer_email text,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_coupon_code text default null,
  p_user_id uuid default null,
  p_ip inet default null,
  p_user_agent text default null,
  p_customer_note text default null
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  _item jsonb; _product public.products%rowtype; _qty integer;
  _subtotal integer := 0; _discount integer := 0;
  _coupon jsonb; _coupon_id uuid;
  _order_id uuid; _order_number integer; _order_item_id uuid;
  _reserved integer; _image_url text;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Carrinho vazio.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'Carrinho excede o limite de 50 itens.' using errcode = 'P0001';
  end if;

  _order_id := gen_random_uuid();

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

    _subtotal := _subtotal + (_product.price_cents * _qty);
  end loop;

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
    coupon_id, coupon_code, customer_note, ip_address, user_agent
  ) values (
    _order_id, p_user_id, p_customer_email::extensions.citext, p_customer_name, p_customer_phone,
    'pending', 'pending', _subtotal, _discount, _subtotal - _discount,
    _coupon_id, case when _coupon_id is not null then trim(p_coupon_code) end,
    p_customer_note, p_ip, p_user_agent
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

create or replace function public.get_my_delivery(
  p_order_id uuid, p_user_id uuid default null, p_email text default null
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  _order public.orders%rowtype;
  _result jsonb;
begin
  select * into _order from public.orders where id = p_order_id;
  if not found then
    raise exception 'Pedido nao encontrado.' using errcode = 'P0001';
  end if;

  -- Filtro de propriedade reposto à mão (SECURITY DEFINER ignorou o RLS)
  if p_user_id is not null then
    if _order.user_id is distinct from p_user_id then
      raise exception 'Acesso negado a este pedido.' using errcode = '42501';
    end if;
  elsif p_email is not null then
    if _order.customer_email is distinct from p_email::extensions.citext then
      raise exception 'Acesso negado a este pedido.' using errcode = '42501';
    end if;
  else
    raise exception 'Identificacao do comprador ausente.' using errcode = '42501';
  end if;

  if _order.payment_status <> 'paid' then
    return jsonb_build_object('paid', false, 'items', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(item order by item ->> 'product_name'), '[]'::jsonb) into _result
  from (
    select jsonb_build_object(
      'order_item_id', oi.id,
      'product_name',  oi.product_name,
      'quantity',      oi.quantity,
      'delivery_type', coalesce(p.delivery_type::text, 'manual'),
      'contents', coalesce((
        select jsonb_agg(jsonb_build_object(
          'type',    coalesce(dsi.content_type::text, 'text'),
          'content', coalesce(dd.manual_content, dsi.content)
        ))
        from public.digital_deliveries dd
        left join public.digital_stock_items dsi on dsi.id = dd.stock_item_id
        where dd.order_item_id = oi.id
      ), '[]'::jsonb)
    ) as item
    from public.order_items oi
    left join public.products p on p.id = oi.product_id
    where oi.order_id = p_order_id
  ) s;

  update public.digital_deliveries
  set first_viewed_at = coalesce(first_viewed_at, now()), view_count = view_count + 1
  where order_id = p_order_id;

  return jsonb_build_object('paid', true, 'items', _result);
end;
$$;

revoke all on function public.create_order(jsonb, text, text, text, text, uuid, inet, text, text) from public, anon, authenticated;
revoke all on function public.get_my_delivery(uuid, uuid, text) from public, anon, authenticated;
