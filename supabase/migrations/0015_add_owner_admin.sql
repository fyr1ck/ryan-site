-- =============================================================================
-- Dono da loja: entra na allowlist como super_admin.
-- Vira admin de fato no primeiro login (magic link) — ver handle_new_user()
-- em 0001_foundation_rbac.sql.
-- =============================================================================
insert into public.admin_allowlist (email, role, note) values
  ('joao.jhcc31@gmail.com', 'super_admin', 'Dono da loja')
on conflict (email) do nothing;
