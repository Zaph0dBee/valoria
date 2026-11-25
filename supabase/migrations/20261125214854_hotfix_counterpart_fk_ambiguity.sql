-- HOTFIX: a FK nova transactions.counterpart_profile_id → financial_profiles
-- deixou ambíguo o embed `financial_profiles(...)` usado pelo app publicado
-- na tela de Lançamentos (PostgREST não sabe qual das duas FKs usar).
-- Remove só essa FK até o app passar a indicar a relação explicitamente.
-- Integridade do destino continua garantida por validate_profile_relations
-- (destino precisa existir e ser do mesmo usuário). Nenhuma transferência existe.
alter table public.transactions drop constraint if exists transactions_counterpart_profile_id_fkey;
