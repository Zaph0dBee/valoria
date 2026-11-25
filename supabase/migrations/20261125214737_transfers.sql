-- ============================================================================
-- Valoria — PF + PJ, fase 3 (parte 2): transferências entre perfis
-- Spec: docs/superpowers/specs/2026-11-25-pf-pj-perfis-design.md
--   (seções "Transferência entre perfis" e "Transferência vinda dos dois extratos")
--
-- Uma transferência é UM lançamento: pertence ao perfil de origem (profile_id)
-- e o destino a enxerga por counterpart_profile_id.
--   pro_labore     PJ → PF  custo na empresa; entrada na PF
--   lucros         PJ → PF  não é custo; entrada na PF
--   aporte_capital PF → PJ  entrada de capital na empresa; saída na PF
--   outro          qualquer par; sem efeito no resultado da origem
-- No consolidado, transferências não contam (e se anulam no saldo).
-- ============================================================================

-- 1) Tipo do motivo e colunas -------------------------------------------------
do $$ begin
  create type public.transfer_reason as enum ('pro_labore', 'lucros', 'aporte_capital', 'outro');
exception when duplicate_object then null;
end $$;

alter table public.transactions
  add column if not exists counterpart_profile_id uuid references public.financial_profiles(id) on delete no action,
  add column if not exists transfer_reason public.transfer_reason;

create index if not exists idx_transactions_counterpart_date
  on public.transactions(counterpart_profile_id, occurred_on desc)
  where counterpart_profile_id is not null;

alter table public.transactions drop constraint if exists transactions_transfer_shape;
alter table public.transactions
  add constraint transactions_transfer_shape check (
    (kind <> 'transferencia' and counterpart_profile_id is null and transfer_reason is null)
    or (
      kind = 'transferencia'
      and counterpart_profile_id is not null
      and transfer_reason is not null
      and category_id is null
      and subcategory_id is null
      and reserve_id is null
      and counterpart_profile_id <> profile_id
    )
  );

-- 2) Validações (mantém tudo da fase 2 e acrescenta o destino) -----------------
create or replace function public.validate_profile_relations()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid;
  v_archived boolean;
  v_profile_kind public.profile_kind;
  v_category uuid;
  v_category_profile uuid;
  v_counterpart uuid;
  v_cp_owner uuid;
  v_cp_archived boolean;
  v_cp_kind public.profile_kind;
  v_reason text;
begin
  select fp.user_id, fp.archived, fp.kind into v_owner, v_archived, v_profile_kind
  from public.financial_profiles fp
  where fp.id = new.profile_id;

  if v_owner is null or v_owner <> new.user_id then
    raise exception 'Perfil inválido para este usuário' using errcode = '23514';
  end if;

  if v_archived and (tg_op = 'INSERT' or new.profile_id is distinct from old.profile_id) then
    raise exception 'Este perfil está arquivado' using errcode = '23514';
  end if;

  if tg_table_name = 'categories' and tg_op = 'UPDATE' and new.profile_id is distinct from old.profile_id then
    raise exception 'Não é possível mover uma categoria para outro perfil' using errcode = '23514';
  end if;

  if v_profile_kind = 'pj'
     and tg_table_name in ('transactions', 'recurring_transactions', 'categories')
     and (to_jsonb(new) ->> 'kind') = 'reserva' then
    raise exception 'Empresas não fazem aporte em metas. Transfira para a PF primeiro.' using errcode = '23514';
  end if;

  if tg_table_name in ('transactions', 'budgets', 'recurring_transactions') then
    v_category := (to_jsonb(new) ->> 'category_id')::uuid;
    if v_category is not null then
      select c.profile_id into v_category_profile from public.categories c where c.id = v_category;
      if v_category_profile is distinct from new.profile_id then
        raise exception 'A categoria pertence a outro perfil' using errcode = '23514';
      end if;
    end if;
  end if;

  if tg_table_name = 'transactions' and (to_jsonb(new) ->> 'kind') = 'transferencia' then
    v_counterpart := (to_jsonb(new) ->> 'counterpart_profile_id')::uuid;
    select fp.user_id, fp.archived, fp.kind into v_cp_owner, v_cp_archived, v_cp_kind
    from public.financial_profiles fp
    where fp.id = v_counterpart;

    if v_cp_owner is null or v_cp_owner <> new.user_id then
      raise exception 'Perfil de destino inválido' using errcode = '23514';
    end if;

    if v_cp_archived and (
      tg_op = 'INSERT'
      or v_counterpart is distinct from (to_jsonb(old) ->> 'counterpart_profile_id')::uuid
    ) then
      raise exception 'O perfil de destino está arquivado' using errcode = '23514';
    end if;

    v_reason := to_jsonb(new) ->> 'transfer_reason';
    if v_reason in ('pro_labore', 'lucros') and not (v_profile_kind = 'pj' and v_cp_kind = 'pf') then
      raise exception 'Pró-labore e lucros vão da empresa para a PF' using errcode = '23514';
    end if;
    if v_reason = 'aporte_capital' and not (v_profile_kind = 'pf' and v_cp_kind = 'pj') then
      raise exception 'Aporte de capital vai da PF para a empresa' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

-- 3) Resumo mensal com transferências -----------------------------------------
-- O tipo de retorno muda (colunas novas no FINAL), então é drop + create.
-- As 9 primeiras colunas mantêm nome, ordem e significado para quem não tem
-- transferências; o app publicado lê as colunas pelo nome.
drop function if exists public.get_monthly_financial_summary(int, int);
drop function if exists public.get_monthly_financial_summary(int, int, uuid);

create function public.get_monthly_financial_summary(
  target_year int,
  target_month int,
  target_profile uuid
)
returns table (
  month date,
  saldo_inicial numeric,
  total_receita numeric,
  total_despesa numeric,
  resultado_operacional numeric,
  total_aportes numeric,
  disponivel_antes_aportes numeric,
  saldo_final numeric,
  transactions_count bigint,
  transf_recebidas numeric,
  transf_enviadas numeric,
  entradas_transferidas numeric,
  pro_labore_pago numeric,
  lucros_distribuidos numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select
      make_date(target_year, target_month, 1) as month_start,
      (make_date(target_year, target_month, 1) + interval '1 month')::date as next_month
  ),
  per_profile as (
    select
      coalesce(a.opening_balance, 0)
      + coalesce((
          select sum(
            case t.kind
              when 'receita' then t.amount
              when 'despesa' then -t.amount
              when 'reserva' then -t.amount
              when 'transferencia' then -t.amount
            end
          )
          from public.transactions t
          where t.user_id = auth.uid()
            and t.profile_id = fp.id
            and t.occurred_on < p.month_start
            and (a.anchor_month is null or t.occurred_on >= a.anchor_month)
        ), 0)
      + coalesce((
          select sum(t.amount)
          from public.transactions t
          where t.user_id = auth.uid()
            and t.kind = 'transferencia'
            and t.counterpart_profile_id = fp.id
            and t.occurred_on < p.month_start
            and (a.anchor_month is null or t.occurred_on >= a.anchor_month)
        ), 0) as opening_balance,
      m.receita,
      m.despesa,
      m.aportes,
      m.enviadas,
      m.pro_labore,
      m.lucros,
      m.tx_count,
      r.recebidas,
      r.entradas_transferidas,
      r.rx_count
    from public.financial_profiles fp
    cross join params p
    left join lateral (
      select make_date(mb.year, mb.month, 1) as anchor_month, mb.opening_balance
      from public.monthly_balances mb
      where mb.user_id = auth.uid()
        and mb.profile_id = fp.id
        and make_date(mb.year, mb.month, 1) <= p.month_start
      order by mb.year desc, mb.month desc
      limit 1
    ) a on true
    cross join lateral (
      select
        coalesce(sum(t.amount) filter (where t.kind = 'receita'), 0) as receita,
        coalesce(sum(t.amount) filter (where t.kind = 'despesa'), 0) as despesa,
        coalesce(sum(t.amount) filter (where t.kind = 'reserva'), 0) as aportes,
        coalesce(sum(t.amount) filter (where t.kind = 'transferencia'), 0) as enviadas,
        coalesce(sum(t.amount) filter (where t.kind = 'transferencia' and t.transfer_reason = 'pro_labore'), 0) as pro_labore,
        coalesce(sum(t.amount) filter (where t.kind = 'transferencia' and t.transfer_reason = 'lucros'), 0) as lucros,
        count(t.id) as tx_count
      from public.transactions t
      where t.user_id = auth.uid()
        and t.profile_id = fp.id
        and t.occurred_on >= p.month_start
        and t.occurred_on < p.next_month
    ) m
    cross join lateral (
      select
        coalesce(sum(t.amount), 0) as recebidas,
        coalesce(sum(t.amount) filter (where t.transfer_reason in ('pro_labore', 'lucros', 'outro')), 0) as entradas_transferidas,
        count(t.id) as rx_count
      from public.transactions t
      where t.user_id = auth.uid()
        and t.kind = 'transferencia'
        and t.counterpart_profile_id = fp.id
        and t.occurred_on >= p.month_start
        and t.occurred_on < p.next_month
    ) r
    where fp.user_id = auth.uid()
      and (target_profile is null or fp.id = target_profile)
  ),
  totals as (
    select
      coalesce(sum(opening_balance), 0) as opening_balance,
      coalesce(sum(receita), 0) as receita,
      coalesce(sum(despesa), 0) as despesa,
      coalesce(sum(aportes), 0) as aportes,
      coalesce(sum(enviadas), 0) as enviadas,
      coalesce(sum(pro_labore), 0) as pro_labore,
      coalesce(sum(lucros), 0) as lucros,
      coalesce(sum(tx_count), 0)::bigint as tx_count,
      coalesce(sum(recebidas), 0) as recebidas,
      coalesce(sum(entradas_transferidas), 0) as entradas_transferidas,
      coalesce(sum(rx_count), 0)::bigint as rx_count
    from per_profile
  )
  select
    p.month_start,
    o.opening_balance,
    o.receita,
    o.despesa,
    case
      when target_profile is null then o.receita - o.despesa
      else o.receita + o.entradas_transferidas - o.despesa - o.pro_labore
    end,
    o.aportes,
    o.opening_balance + o.receita - o.despesa + o.recebidas - o.enviadas,
    o.opening_balance + o.receita - o.despesa + o.recebidas - o.enviadas - o.aportes,
    case when target_profile is null then o.tx_count else o.tx_count + o.rx_count end,
    case when target_profile is null then 0 else o.recebidas end,
    case when target_profile is null then 0 else o.enviadas end,
    case when target_profile is null then 0 else o.entradas_transferidas end,
    case when target_profile is null then 0 else o.pro_labore end,
    case when target_profile is null then 0 else o.lucros end
  from params p
  cross join totals o;
$$;

revoke all on function public.get_monthly_financial_summary(int, int, uuid) from public;
revoke all on function public.get_monthly_financial_summary(int, int, uuid) from anon;
grant execute on function public.get_monthly_financial_summary(int, int, uuid) to authenticated;

create function public.get_monthly_financial_summary(
  target_year int,
  target_month int
)
returns table (
  month date,
  saldo_inicial numeric,
  total_receita numeric,
  total_despesa numeric,
  resultado_operacional numeric,
  total_aportes numeric,
  disponivel_antes_aportes numeric,
  saldo_final numeric,
  transactions_count bigint,
  transf_recebidas numeric,
  transf_enviadas numeric,
  entradas_transferidas numeric,
  pro_labore_pago numeric,
  lucros_distribuidos numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select * from public.get_monthly_financial_summary(target_year, target_month, null::uuid);
$$;

revoke all on function public.get_monthly_financial_summary(int, int) from public;
revoke all on function public.get_monthly_financial_summary(int, int) from anon;
grant execute on function public.get_monthly_financial_summary(int, int) to authenticated;
