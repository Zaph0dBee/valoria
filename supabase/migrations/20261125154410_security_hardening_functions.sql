-- Revisão de segurança (advisors do Supabase, 2026-11-25).
--
-- seed_default_categories continua executável por usuários logados de
-- propósito: o signup a chama, e ela recusa target_user ≠ auth.uid().
--
-- Proteção contra senhas vazadas é configuração do Auth (painel), não SQL.

-- handle_new_user é função de trigger (signup); não deve ser exposta como RPC.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- search_path fixo: evita que objetos com o mesmo nome em outro schema
-- sejam usados no lugar dos esperados.
alter function public.set_updated_at() set search_path = '';
