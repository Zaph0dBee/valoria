-- Fase 4 PF+PJ: impostos da empresa e resumo de vários meses para relatórios.
-- Só adiciona: coluna com default, trigger novo, função nova. Nada existente muda de valor.

-- 1) Marca de imposto nas categorias ------------------------------------------
alter table public.categories add column if not exists is_tax boolean not null default false;

create or replace function public.validate_category_tax()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.is_tax and (
    new.kind <> 'despesa'
    or not exists (select 1 from public.financial_profiles fp where fp.id = new.profile_id and fp.kind = 'pj')
  ) then
    raise exception 'Só despesas da empresa podem ser marcadas como imposto' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_20_validate_category_tax on public.categories;
create trigger trg_20_validate_category_tax
  before insert or update of is_tax, profile_id, kind on public.categories
  for each row execute function public.validate_category_tax();

-- 2) Template de empresa já marca "Impostos (DAS/Simples)" --------------------
create or replace function public.apply_pj_template(target_profile uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or not exists (
    select 1 from public.financial_profiles fp
    where fp.id = target_profile and fp.user_id = v_user and fp.kind = 'pj'
  ) then
    raise exception 'Empresa não encontrada' using errcode = '23514';
  end if;

  insert into public.categories (user_id, profile_id, name, kind, color, sort_order, is_tax) values
    (v_user, target_profile, 'Vendas',                 'receita', '#B99154', 1, false),
    (v_user, target_profile, 'Prestação de serviços',  'receita', '#B99154', 2, false),
    (v_user, target_profile, 'Outras receitas',        'receita', '#B99154', 3, false),
    (v_user, target_profile, 'Impostos (DAS/Simples)', 'despesa', '#9FA88A', 1, true),
    (v_user, target_profile, 'Fornecedores e insumos', 'despesa', '#9FA88A', 2, false),
    (v_user, target_profile, 'Folha e encargos',       'despesa', '#9FA88A', 3, false),
    (v_user, target_profile, 'Aluguel e estrutura',    'despesa', '#9FA88A', 4, false),
    (v_user, target_profile, 'Software e ferramentas', 'despesa', '#9FA88A', 5, false),
    (v_user, target_profile, 'Marketing',              'despesa', '#9FA88A', 6, false),
    (v_user, target_profile, 'Tarifas bancárias',      'despesa', '#9FA88A', 7, false),
    (v_user, target_profile, 'Contabilidade',          'despesa', '#9FA88A', 8, false),
    (v_user, target_profile, 'Outros',                 'despesa', '#78716c', 9, false)
  on conflict (profile_id, name, kind) do nothing;
end;
$$;

revoke execute on function public.apply_pj_template(uuid) from public, anon;
grant execute on function public.apply_pj_template(uuid) to authenticated;

update public.categories c set is_tax = true
where c.name = 'Impostos (DAS/Simples)' and c.kind = 'despesa' and not c.is_tax
  and exists (select 1 from public.financial_profiles fp where fp.id = c.profile_id and fp.kind = 'pj');

-- 3) Resumo de vários meses × perfis (relatórios) -----------------------------
create or replace function public.get_monthly_summaries(start_month date, months int)
returns table (
  month date,
  profile_id uuid,
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
language plpgsql
stable
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_user uuid := auth.uid();
  v_month date;
  v_profile uuid;
begin
  if months is null or months < 1 or months > 24 then
    raise exception 'O período precisa ter entre 1 e 24 meses' using errcode = '22023';
  end if;
  if v_user is null or start_month is null then
    return;
  end if;

  for v_month in
    select gs::date from generate_series(
      date_trunc('month', start_month),
      date_trunc('month', start_month) + make_interval(months => months - 1),
      interval '1 month') gs
  loop
    for v_profile in
      select fp.id from public.financial_profiles fp
      where fp.user_id = v_user
      union all select null::uuid
    loop
      return query
        select v_month, v_profile, s.saldo_inicial, s.total_receita, s.total_despesa,
               s.resultado_operacional, s.total_aportes, s.disponivel_antes_aportes,
               s.saldo_final, s.transactions_count, s.transf_recebidas, s.transf_enviadas,
               s.entradas_transferidas, s.pro_labore_pago, s.lucros_distribuidos
        from public.get_monthly_financial_summary(
          extract(year from v_month)::int, extract(month from v_month)::int, v_profile) s;
    end loop;
  end loop;
end;
$$;

revoke execute on function public.get_monthly_summaries(date, int) from public, anon;
grant execute on function public.get_monthly_summaries(date, int) to authenticated;
