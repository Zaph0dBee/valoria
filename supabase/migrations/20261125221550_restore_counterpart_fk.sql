-- Recoloca a FK do destino da transferência, removida no hotfix
-- 20261125214854. Seguro agora: o app publicado indica a relação explícita
-- (financial_profiles!transactions_profile_id_fkey) em todo embed de perfil
-- a partir de transactions, então não há mais ambiguidade no PostgREST.
alter table public.transactions drop constraint if exists transactions_counterpart_profile_id_fkey;
alter table public.transactions
  add constraint transactions_counterpart_profile_id_fkey
  foreign key (counterpart_profile_id) references public.financial_profiles(id) on delete no action;
