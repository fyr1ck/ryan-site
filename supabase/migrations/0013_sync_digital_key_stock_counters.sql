-- =============================================================================
-- 0013 — Espelhar o estoque de chaves digitais em products.stock_quantity
-- =============================================================================
-- PROBLEMA: para stock_policy = 'digital_keys' o estoque real vive em
-- digital_stock_items, e products.stock_quantity ficava 0. Qualquer listagem
-- que calcule "quantity - reserved" (o grid, o card, os filtros) lia 0 e
-- mostrava "Esgotado" em produto com chave sobrando — metade do catálogo
-- invisível para venda, sem erro em lugar nenhum.
--
-- Chamar a RPC product_available_stock() por card resolveria, mas custaria uma
-- ida ao banco por produto renderizado (N+1 no grid inteiro).
--
-- SOLUÇÃO: manter os dois contadores sincronizados por trigger, de forma que
--   stock_quantity  = chaves disponíveis + reservadas
--   stock_reserved  = chaves reservadas
-- e portanto (stock_quantity - stock_reserved) = chaves disponíveis, a mesma
-- aritmética que já vale para 'manual'. A listagem não precisa saber a política.
-- =============================================================================

create or replace function public.sync_digital_stock_counters()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _ids uuid[];
begin
  -- Transition tables: um INSERT de 500 chaves recalcula o produto uma vez,
  -- não 500. Por isso os triggers são FOR EACH STATEMENT.
  if tg_op = 'INSERT' then
    select array_agg(distinct product_id) into _ids from new_rows;
  elsif tg_op = 'DELETE' then
    select array_agg(distinct product_id) into _ids from old_rows;
  else
    select array_agg(distinct pid) into _ids from (
      select product_id as pid from new_rows
      union
      select product_id from old_rows
    ) t;
  end if;

  if _ids is null then return null; end if;

  update public.products p
  set stock_quantity = c.total,
      stock_reserved = c.reservado
  from (
    select pid as product_id,
           (select count(*) from public.digital_stock_items d
             where d.product_id = pid and d.status in ('available','reserved'))::int as total,
           (select count(*) from public.digital_stock_items d
             where d.product_id = pid and d.status = 'reserved')::int as reservado
    from unnest(_ids) as pid
  ) c
  where p.id = c.product_id
    and p.stock_policy = 'digital_keys'
    and (p.stock_quantity is distinct from c.total
         or p.stock_reserved is distinct from c.reservado);

  return null;
end;
$$;

revoke all on function public.sync_digital_stock_counters() from public, anon, authenticated;

-- Três triggers: o Postgres só permite uma tabela de transição por operação
create trigger digital_stock_sync_insert
  after insert on public.digital_stock_items
  referencing new table as new_rows
  for each statement execute function public.sync_digital_stock_counters();

create trigger digital_stock_sync_update
  after update on public.digital_stock_items
  referencing new table as new_rows old table as old_rows
  for each statement execute function public.sync_digital_stock_counters();

create trigger digital_stock_sync_delete
  after delete on public.digital_stock_items
  referencing old table as old_rows
  for each statement execute function public.sync_digital_stock_counters();

-- Backfill dos produtos que já existem
update public.products p
set stock_quantity = c.total,
    stock_reserved = c.reservado
from (
  select p2.id,
         count(*) filter (where d.status in ('available','reserved'))::int as total,
         count(*) filter (where d.status = 'reserved')::int                as reservado
  from public.products p2
  left join public.digital_stock_items d on d.product_id = p2.id
  where p2.stock_policy = 'digital_keys'
  group by p2.id
) c
where p.id = c.id;
