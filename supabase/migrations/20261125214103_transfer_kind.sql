-- ============================================================================
-- Valoria — PF + PJ, fase 3 (parte 1): novo tipo de lançamento "transferencia"
-- Separada das demais mudanças porque um valor novo de enum não pode ser usado
-- na mesma transação em que é criado. Aditiva: nenhuma linha usa o valor ainda.
-- ============================================================================

alter type public.transaction_kind add value if not exists 'transferencia';

-- Transferência é só lançamento entre perfis: não existe categoria nem regra
-- recorrente desse tipo. (Comparação por texto: o valor novo ainda não pode
-- ser usado como enum nesta transação.)
alter table public.categories drop constraint if exists categories_kind_not_transfer;
alter table public.categories
  add constraint categories_kind_not_transfer check (kind::text <> 'transferencia');

alter table public.recurring_transactions drop constraint if exists recurring_transactions_kind_not_transfer;
alter table public.recurring_transactions
  add constraint recurring_transactions_kind_not_transfer check (kind::text <> 'transferencia');
