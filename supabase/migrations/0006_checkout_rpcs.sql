-- =============================================================================
-- 0006 — RPCs DE CHECKOUT
-- =============================================================================
-- O núcleo transacional da loja. Três garantias:
--   1. Preço vem SEMPRE do banco — o cliente manda só product_id + quantidade.
--   2. Estoque é reservado na mesma transação do pedido: se um item falta,
--      tudo reverte e nada fica reservado pela metade.
--   3. mark_order_paid é idempotente — webhook duplicado não entrega duas vezes.
--
-- NOTA HISTÓRICA: as funções aqui usam `::citext` sem qualificar. Como elas
-- rodam com search_path = '', isso falha em runtime. A migration 0011 corrige
-- para `extensions.citext`, depois que 0010 move a extensão de schema.
-- A ordem 0001→0011 reproduz o estado correto.
-- =============================================================================

create or replace function public.compute_coupon_discount(
  p_code text,
  p_subtotal_cents integer,
  p_email text default null,
  p_user_id uuid default null
)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  c public.coupons%rowtype;
  _used_by_customer integer;
  _discount integer;
begin
  select * into c from public.coupons
  where code = p_code::citext and is_active
  limit 1;

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
    return jsonb_build_object(
      'valid', false,
      'reason', 'Pedido minimo de R$ ' || to_char(c.minimum_order_cents / 100.0, 'FM999999990.00') || ' para usar este cupom.',
      'discount_cents', 0
    );
  end if;

  -- Limite por cliente: casa por user_id quando logado, senão por e-mail
  if p_user_id is not null or p_email is not null then
    select count(*) into _used_by_customer
    from public.coupon_redemptions r
    where r.coupon_id = c.id
      and (
        (p_user_id is not null and r.user_id = p_user_id)
        or (p_user_id is null and p_email is not null and r.email = p_email::citext)
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

  -- Desconto nunca ultrapassa o subtotal (total não pode ficar negativo)
  _discount := least(_discount, p_subtotal_cents);

  return jsonb_build_object(
    'valid', true, 'reason', null, 'discount_cents', _discount,
    'coupon_id', c.id, 'code', c.code
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- CRIAÇÃO DE PEDIDO — transacional e à prova de overselling
-- -----------------------------------------------------------------------------
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
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  _item          jsonb;
  _product       public.products%rowtype;
  _qty           integer;
  _subtotal      integer := 0;
  _discount      integer := 0;
  _coupon        jsonb;
  _coupon_id     uuid;
  _order_id      uuid;
  _order_number  integer;
  _order_item_id uuid;
  _reserved      integer;
  _image_url     text;
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

    select * into _product
    from public.products
    where id = (_item ->> 'product_id')::uuid and status = 'active'
    for update;

    if not found then
      raise exception 'Produto indisponivel ou inexistente.' using errcode = 'P0001';
    end if;

    _subtotal := _subtotal + (_product.price_cents * _qty);
  end loop;

  -- Cupom avaliado sobre o subtotal recalculado no servidor
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
    _order_id, p_user_id, p_customer_email::citext, p_customer_name, p_customer_phone,
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
    )
    returning id into _order_item_id;

    if _product.stock_policy = 'manual' then
      -- O UPDATE condicional trava a linha: duas transações simultâneas
      -- serializam aqui, e a segunda vê o estoque já decrementado.
      update public.products
      set stock_reserved = stock_reserved + _qty
      where id = _product.id
        and (stock_quantity - stock_reserved) >= _qty;

      if not found then
        raise exception 'Estoque insuficiente para "%".', _product.name using errcode = 'P0001';
      end if;

    elsif _product.stock_policy = 'digital_keys' then
      -- SKIP LOCKED: compradores simultâneos pegam chaves diferentes em vez
      -- de esperar na fila; quem não achar saldo suficiente falha e reverte.
      with picked as (
        select id from public.digital_stock_items
        where product_id = _product.id and status = 'available'
        order by created_at
        limit _qty
        for update skip locked
      )
      update public.digital_stock_items s
      set status = 'reserved', reserved_at = now(), order_item_id = _order_item_id
      from picked
      where s.id = picked.id;

      get diagnostics _reserved = row_count;

      if _reserved < _qty then
        raise exception 'Estoque insuficiente para "%". Restam % unidade(s).',
          _product.name, _reserved using errcode = 'P0001';
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'order_id', _order_id,
    'order_number', _order_number,
    'subtotal_cents', _subtotal,
    'discount_cents', _discount,
    'total_cents', _subtotal - _discount
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- CONFIRMAÇÃO DE PAGAMENTO — baixa estoque e entrega o digital (idempotente)
-- -----------------------------------------------------------------------------
create or replace function public.mark_order_paid(p_order_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  _order public.orders%rowtype;
  _oi    record;
  _stock record;
  _delivered integer := 0;
begin
  select * into _order from public.orders where id = p_order_id for update;

  if not found then
    raise exception 'Pedido nao encontrado.' using errcode = 'P0001';
  end if;

  -- Idempotência: webhook duplicado devolve o estado atual sem reprocessar
  if _order.payment_status = 'paid' then
    return jsonb_build_object('order_id', _order.id, 'already_paid', true, 'status', _order.status);
  end if;

  update public.orders
  set payment_status = 'paid',
      status = 'processing',
      paid_at = coalesce(paid_at, now())
  where id = p_order_id;

  for _oi in
    select oi.*, p.stock_policy, p.delivery_type
    from public.order_items oi
    left join public.products p on p.id = oi.product_id
    where oi.order_id = p_order_id
  loop
    -- Converte reserva em venda
    if _oi.stock_policy = 'manual' then
      update public.products
      set stock_quantity = greatest(stock_quantity - _oi.quantity, 0),
          stock_reserved = greatest(stock_reserved - _oi.quantity, 0),
          sales_count    = sales_count + _oi.quantity
      where id = _oi.product_id;

    elsif _oi.stock_policy = 'digital_keys' then
      update public.digital_stock_items
      set status = 'delivered', delivered_at = now()
      where order_item_id = _oi.id and status = 'reserved';

      update public.products
      set sales_count = sales_count + _oi.quantity
      where id = _oi.product_id;

      for _stock in
        select id from public.digital_stock_items
        where order_item_id = _oi.id and status = 'delivered'
      loop
        insert into public.digital_deliveries (order_id, order_item_id, stock_item_id)
        values (p_order_id, _oi.id, _stock.id)
        on conflict do nothing;
        _delivered := _delivered + 1;
      end loop;

    else
      update public.products
      set sales_count = sales_count + _oi.quantity
      where id = _oi.product_id;
    end if;
  end loop;

  -- Pedido 100% automático já nasce concluído; se tiver item manual,
  -- fica em 'processing' esperando o admin entregar.
  if not exists (
    select 1 from public.order_items oi
    join public.products p on p.id = oi.product_id
    where oi.order_id = p_order_id and p.delivery_type = 'manual'
  ) then
    update public.orders
    set status = 'completed', completed_at = now()
    where id = p_order_id;
  end if;

  if _order.coupon_id is not null then
    insert into public.coupon_redemptions (coupon_id, order_id, user_id, email, discount_cents)
    values (_order.coupon_id, _order.id, _order.user_id, _order.customer_email, _order.discount_cents)
    on conflict (coupon_id, order_id) do nothing;

    update public.coupons set usage_count = usage_count + 1 where id = _order.coupon_id;
  end if;

  return jsonb_build_object('order_id', _order.id, 'already_paid', false, 'delivered_items', _delivered);
end;
$$;

-- -----------------------------------------------------------------------------
-- CANCELAMENTO — devolve o estoque reservado ao pool
-- -----------------------------------------------------------------------------
create or replace function public.cancel_order(p_order_id uuid, p_reason text default null)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  _order public.orders%rowtype;
  _oi    record;
begin
  select * into _order from public.orders where id = p_order_id for update;

  if not found then
    raise exception 'Pedido nao encontrado.' using errcode = 'P0001';
  end if;

  if _order.status in ('cancelled', 'refunded') then
    return jsonb_build_object('order_id', _order.id, 'already_cancelled', true);
  end if;

  for _oi in
    select oi.*, p.stock_policy
    from public.order_items oi
    left join public.products p on p.id = oi.product_id
    where oi.order_id = p_order_id
  loop
    if _oi.stock_policy = 'manual' and _order.payment_status <> 'paid' then
      update public.products
      set stock_reserved = greatest(stock_reserved - _oi.quantity, 0)
      where id = _oi.product_id;

    elsif _oi.stock_policy = 'digital_keys' then
      -- Só devolve o que ainda não foi entregue de fato
      update public.digital_stock_items
      set status = 'available', reserved_at = null, order_item_id = null
      where order_item_id = _oi.id and status = 'reserved';
    end if;
  end loop;

  update public.orders
  set status = 'cancelled',
      cancelled_at = now(),
      admin_note = coalesce(admin_note || E'\n', '') || coalesce('Cancelado: ' || p_reason, 'Cancelado')
  where id = p_order_id;

  return jsonb_build_object('order_id', _order.id, 'already_cancelled', false);
end;
$$;

-- -----------------------------------------------------------------------------
-- Estoque disponível para exibição pública (não vaza o conteúdo das chaves)
-- -----------------------------------------------------------------------------
create or replace function public.product_available_stock(p_product_id uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select case p.stock_policy
    when 'unlimited' then 999999
    when 'manual' then greatest(p.stock_quantity - p.stock_reserved, 0)
    when 'digital_keys' then (
      select count(*)::integer from public.digital_stock_items
      where product_id = p.id and status = 'available'
    )
  end
  from public.products p
  where p.id = p_product_id;
$$;

-- As RPCs de escrita são chamadas só pelo servidor (service_role).
-- Nada de anon/authenticated criando pedido direto pelo PostgREST.
revoke all on function public.create_order(jsonb, text, text, text, text, uuid, inet, text, text) from public, anon, authenticated;
revoke all on function public.mark_order_paid(uuid) from public, anon, authenticated;
revoke all on function public.cancel_order(uuid, text) from public, anon, authenticated;
revoke all on function public.compute_coupon_discount(text, integer, text, uuid) from public, anon, authenticated;

grant execute on function public.product_available_stock(uuid) to anon, authenticated;
