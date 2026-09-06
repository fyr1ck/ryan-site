-- =============================================================================
-- 0012 — log_admin_action chamável pelo admin logado
-- =============================================================================
-- As Server Actions do painel usam o client com a sessão do admin (role
-- `authenticated`), não o service_role. Com a função revogada de authenticated,
-- toda escrita no painel falharia na hora de registrar a auditoria.
--
-- Em vez de simplesmente liberar (o que deixaria qualquer usuário forjar um log
-- com actor_id de outra pessoa), a função agora:
--   * deriva o autor de auth.uid() quando existe sessão — impossível falsificar;
--   * exige que esse autor seja admin;
--   * só aceita p_actor_id quando não há sessão (chamada de servidor/webhook).
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
  _session_uid uuid := (select auth.uid());
  _actor uuid;
begin
  if _session_uid is not null then
    -- Há sessão: o autor é quem está logado, e ele precisa ser admin.
    -- O p_actor_id que veio do cliente é ignorado de propósito.
    _actor := _session_uid;

    if not exists (
      select 1 from public.user_roles
      where user_id = _session_uid and role in ('admin', 'super_admin')
    ) then
      raise exception 'Apenas administradores registram acoes.' using errcode = '42501';
    end if;
  else
    -- Sem sessão: chamada de servidor (service_role) ou webhook.
    _actor := p_actor_id;
  end if;

  select email into _email from public.profiles where id = _actor;

  insert into public.admin_logs (
    actor_id, actor_email, action, entity_type, entity_id, summary, metadata, ip_address
  )
  values (
    _actor, _email, p_action, p_entity_type, p_entity_id, p_summary,
    coalesce(p_metadata, '{}'::jsonb), p_ip
  )
  returning id into _id;

  return _id;
end;
$$;

revoke all on function public.log_admin_action(uuid, text, text, text, text, jsonb, inet) from public, anon;
grant execute on function public.log_admin_action(uuid, text, text, text, text, jsonb, inet) to authenticated;
