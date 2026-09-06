-- =============================================================================
-- 0008 — STORAGE, ENTREGA AO CLIENTE E LOG DE AÇÃO ADMINISTRATIVA
-- =============================================================================

-- Quatro buckets públicos (imagens de vitrine) e um privado.
-- digital-files é privado: arquivo de produto digital só sai por URL assinada.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-images', 'product-images', true,  5242880,
   array['image/jpeg','image/png','image/webp','image/avif','image/gif']),
  ('banners',        'banners',        true,  5242880,
   array['image/jpeg','image/png','image/webp','image/avif','image/gif']),
  ('categories',     'categories',     true,  2097152,
   array['image/jpeg','image/png','image/webp','image/avif']),
  ('store-assets',   'store-assets',   true,  2097152,
   array['image/jpeg','image/png','image/webp','image/avif','image/svg+xml','image/x-icon']),
  ('digital-files',  'digital-files',  false, 52428800, null)
on conflict (id) do nothing;

create policy "public_read_store_buckets" on storage.objects
  for select to anon, authenticated
  using (bucket_id in ('product-images','banners','categories','store-assets'));

create policy "admin_write_store_buckets" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('product-images','banners','categories','store-assets')
    and public.authorize('products.write')
  );

create policy "admin_update_store_buckets" on storage.objects
  for update to authenticated
  using (
    bucket_id in ('product-images','banners','categories','store-assets')
    and public.authorize('products.write')
  );

create policy "admin_delete_store_buckets" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('product-images','banners','categories','store-assets')
    and public.authorize('products.write')
  );

-- digital-files: nem leitura anônima, nem listagem. Só admin de inventário.
create policy "admin_only_digital_files" on storage.objects
  for all to authenticated
  using (bucket_id = 'digital-files' and public.authorize('inventory.read'))
  with check (bucket_id = 'digital-files' and public.authorize('inventory.write'));

-- =============================================================================
-- ENTREGA AO CLIENTE
-- Único caminho pelo qual o conteúdo digital chega a quem comprou.
--
-- SECURITY DEFINER desliga o RLS. Por isso o filtro de propriedade é REPOSTO
-- explicitamente aqui: o pedido tem de ser do usuário (ou do e-mail do
-- convidado) E estar pago. Sem essa reposição, a função entregaria a chave
-- de qualquer pedido para quem soubesse o UUID.
-- =============================================================================
create or replace function public.get_my_delivery(
  p_order_id uuid,
  p_user_id uuid default null,
  p_email text default null
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  _order public.orders%rowtype;
  _result jsonb;
begin
  select * into _order from public.orders where id = p_order_id;

  if not found then
    raise exception 'Pedido nao encontrado.' using errcode = 'P0001';
  end if;

  -- Filtro de propriedade reposto à mão (o definer ignorou o RLS)
  if p_user_id is not null then
    if _order.user_id is distinct from p_user_id then
      raise exception 'Acesso negado a este pedido.' using errcode = '42501';
    end if;
  elsif p_email is not null then
    if _order.customer_email is distinct from p_email::citext then
      raise exception 'Acesso negado a este pedido.' using errcode = '42501';
    end if;
  else
    raise exception 'Identificacao do comprador ausente.' using errcode = '42501';
  end if;

  -- Conteúdo só existe depois do pagamento confirmado
  if _order.payment_status <> 'paid' then
    return jsonb_build_object('paid', false, 'items', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(item order by item ->> 'product_name'), '[]'::jsonb)
  into _result
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

  -- Auditoria de acesso ao conteúdo sensível
  update public.digital_deliveries
  set first_viewed_at = coalesce(first_viewed_at, now()),
      view_count = view_count + 1
  where order_id = p_order_id;

  return jsonb_build_object('paid', true, 'items', _result);
end;
$$;

revoke all on function public.get_my_delivery(uuid, uuid, text) from public, anon, authenticated;

-- =============================================================================
-- Registro de ação administrativa (chamado pelo servidor a cada mutação)
-- =============================================================================
create or replace function public.log_admin_action(
  p_actor_id uuid,
  p_action text,
  p_entity_type text default null,
  p_entity_id text default null,
  p_summary text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_ip inet default null
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  _id uuid;
  _email text;
begin
  select email into _email from public.profiles where id = p_actor_id;

  insert into public.admin_logs (actor_id, actor_email, action, entity_type, entity_id, summary, metadata, ip_address)
  values (p_actor_id, _email, p_action, p_entity_type, p_entity_id, p_summary, coalesce(p_metadata, '{}'::jsonb), p_ip)
  returning id into _id;

  return _id;
end;
$$;

revoke all on function public.log_admin_action(uuid, text, text, text, text, jsonb, inet) from public, anon, authenticated;
