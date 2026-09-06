-- =============================================================================
-- 0014 — Liga/desliga os provedores OAuth pelo painel
-- =============================================================================
-- Os botões "Entrar com Google" e "Entrar com Discord" estavam sempre visíveis,
-- mas o provedor só funciona depois de configurado no Supabase (Authentication
-- → Providers). Antes disso o clique leva a um 400 — botão que não funciona é
-- pior do que botão que não existe.
--
-- Nascem desligados de propósito: a loja sobe com magic link, que funciona sem
-- configuração nenhuma, e cada provedor é ligado aqui depois de configurado.
-- =============================================================================

insert into public.settings (key, value, group_name, label, is_public) values
  ('auth_google_enabled',  'false', 'auth', 'Login com Google (exige configurar em Authentication > Providers)',  true),
  ('auth_discord_enabled', 'false', 'auth', 'Login com Discord (exige configurar em Authentication > Providers)', true)
on conflict (key) do nothing;
