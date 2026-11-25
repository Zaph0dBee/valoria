-- ============================================================================
-- Valoria — PF + PJ, fase 1: perfis financeiros
-- Spec: docs/superpowers/specs/2026-11-25-pf-pj-perfis-design.md
--
-- Cada usuário passa a ter um perfil PF (e, nas próximas fases, perfis PJ).
-- Todos os dados existentes são ligados ao PF. O app atual não envia
-- profile_id: triggers preenchem o PF automaticamente, então nada muda para
-- quem usa o sistema.
-- ============================================================================

-- 1) Tipo e tabela de perfis ---------------------------------------------------
do $$ begin
  create type public.profile_kind as enum ('pf', 'pj');
exception when duplicate_object then null;
end $$;

create table if not exists public.financial_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind public.profile_kind not null,
  name text not null check (length(trim(name)) > 0),
  document text check (document is null or document ~ '^([0-9]{11}|[0-9]{14})$'),
  color text not null default '#B99154',
  archived boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.financial_profiles is
  'Perfis financeiros do usuário: exatamente um PF (pessoa) e zero ou mais PJ (empresas).';
comment on column public.financial_profiles.document is
  'CPF (11) ou CNPJ (14), só dígitos. Opcional.';

create unique index if not exists uq_financial_profiles_one_pf
  on public.financial_profiles(user_id) where kind = 'pf';
create index if not exists idx_financial_profiles_user
  on public.financial_profiles(user_id) where not archived;

alter table public.financial_profiles enable row level security;

drop policy if exists "financial_profiles: dono tudo" on public.financial_profiles;
create policy "financial_profiles: dono tudo" on public.financial_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists trg_financial_profiles_updated on public.financial_profiles;
create trigger trg_financial_profiles_updated
before update on public.financial_profiles
for each row execute function public.set_updated_at();

-- 2) Funções auxiliares --------------------------------------------------------
create or replace function public.pf_profile_id(target_user uuid)
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  select fp.id from public.financial_profiles fp
  where fp.user_id = target_user and fp.kind = 'pf';
$$;

-- Cria o perfil PF de quem ainda não tem. Idempotente.
create or replace function public.ensure_pf_profiles()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.financial_profiles (user_id, kind, name)
  select
    u.id,
    'pf',
    coalesce(nullif(trim(p.full_name), ''), nullif(split_part(u.email, '@', 1), ''), 'Você')
  from auth.users u
  left join public.profiles p on p.id = u.id
  where not exists (
    select 1 from public.financial_profiles fp where fp.user_id = u.id and fp.kind = 'pf'
  )
  on conflict (user_id) where kind = 'pf' do nothing;
end;
$$;

revoke execute on function public.ensure_pf_profiles() from public, anon, authenticated;

select public.ensure_pf_profiles();

-- 3) profile_id nas tabelas de dados + backfill --------------------------------
alter table public.transactions
  add column if not exists profile_id uuid references public.financial_profiles(id) on delete no action;
alter table public.categories
  add column if not exists profile_id uuid references public.financial_profiles(id) on delete no action;
alter table public.monthly_balances
  add column if not exists profile_id uuid references public.financial_profiles(id) on delete no action;
alter table public.imports
  add column if not exists profile_id uuid references public.financial_profiles(id) on delete no action;
alter table public.budgets
  add column if not exists profile_id uuid references public.financial_profiles(id) on delete no action;
alter table public.recurring_transactions
  add column if not exists profile_id uuid references public.financial_profiles(id) on delete no action;

-- O backfill só preenche profile_id: desliga os triggers de updated_at para
-- não alterar a data de "última modificação" dos dados dos usuários.
alter table public.transactions disable trigger trg_transactions_updated;
alter table public.monthly_balances disable trigger trg_monthly_balances_updated;
alter table public.budgets disable trigger trg_budgets_updated;
alter table public.recurring_transactions disable trigger trg_recurring_transactions_updated;

update public.transactions set profile_id = public.pf_profile_id(user_id) where profile_id is null;
update public.categories set profile_id = public.pf_profile_id(user_id) where profile_id is null;
update public.monthly_balances set profile_id = public.pf_profile_id(user_id) where profile_id is null;
update public.imports set profile_id = public.pf_profile_id(user_id) where profile_id is null;
update public.budgets set profile_id = public.pf_profile_id(user_id) where profile_id is null;
update public.recurring_transactions set profile_id = public.pf_profile_id(user_id) where profile_id is null;

alter table public.transactions enable trigger trg_transactions_updated;
alter table public.monthly_balances enable trigger trg_monthly_balances_updated;
alter table public.budgets enable trigger trg_budgets_updated;
alter table public.recurring_transactions enable trigger trg_recurring_transactions_updated;

alter table public.transactions alter column profile_id set not null;
alter table public.categories alter column profile_id set not null;
alter table public.monthly_balances alter column profile_id set not null;
alter table public.imports alter column profile_id set not null;
alter table public.budgets alter column profile_id set not null;
alter table public.recurring_transactions alter column profile_id set not null;

create index if not exists idx_transactions_profile_date on public.transactions(profile_id, occurred_on desc);
create index if not exists idx_categories_profile on public.categories(profile_id);
create index if not exists idx_monthly_balances_profile on public.monthly_balances(profile_id);
create index if not exists idx_imports_profile on public.imports(profile_id);
create index if not exists idx_budgets_profile on public.budgets(profile_id);
create index if not exists idx_recurring_transactions_profile on public.recurring_transactions(profile_id);

-- 4) Preenchimento automático do perfil ----------------------------------------
-- O app atual não envia profile_id. Usa o perfil da categoria quando houver;
-- senão, o PF do usuário. Nome com "00" para rodar antes das validações
-- (triggers BEFORE executam em ordem alfabética).
create or replace function public.fill_default_profile()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_category uuid;
begin
  if new.profile_id is not null then
    return new;
  end if;

  if tg_table_name in ('transactions', 'budgets', 'recurring_transactions') then
    v_category := (to_jsonb(new) ->> 'category_id')::uuid;
    if v_category is not null then
      select c.profile_id into new.profile_id
      from public.categories c
      where c.id = v_category and c.user_id = new.user_id;
    end if;
  end if;

  if new.profile_id is null then
    new.profile_id := public.pf_profile_id(new.user_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_00_fill_default_profile on public.transactions;
create trigger trg_00_fill_default_profile before insert on public.transactions
  for each row execute function public.fill_default_profile();
drop trigger if exists trg_00_fill_default_profile on public.categories;
create trigger trg_00_fill_default_profile before insert on public.categories
  for each row execute function public.fill_default_profile();
drop trigger if exists trg_00_fill_default_profile on public.monthly_balances;
create trigger trg_00_fill_default_profile before insert on public.monthly_balances
  for each row execute function public.fill_default_profile();
drop trigger if exists trg_00_fill_default_profile on public.imports;
create trigger trg_00_fill_default_profile before insert on public.imports
  for each row execute function public.fill_default_profile();
drop trigger if exists trg_00_fill_default_profile on public.budgets;
create trigger trg_00_fill_default_profile before insert on public.budgets
  for each row execute function public.fill_default_profile();
drop trigger if exists trg_00_fill_default_profile on public.recurring_transactions;
create trigger trg_00_fill_default_profile before insert on public.recurring_transactions
  for each row execute function public.fill_default_profile();

-- 5) Integridade entre perfis --------------------------------------------------
create or replace function public.validate_profile_relations()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid;
  v_archived boolean;
  v_category uuid;
  v_category_profile uuid;
begin
  select fp.user_id, fp.archived into v_owner, v_archived
  from public.financial_profiles fp
  where fp.id = new.profile_id;

  if v_owner is null or v_owner <> new.user_id then
    raise exception 'Perfil inválido para este usuário' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' and v_archived then
    raise exception 'Este perfil está arquivado' using errcode = '23514';
  end if;

  if tg_table_name = 'categories' and tg_op = 'UPDATE' and new.profile_id is distinct from old.profile_id then
    raise exception 'Não é possível mover uma categoria para outro perfil' using errcode = '23514';
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

  return new;
end;
$$;

drop trigger if exists trg_10_validate_profile_relations on public.transactions;
create trigger trg_10_validate_profile_relations before insert or update on public.transactions
  for each row execute function public.validate_profile_relations();
drop trigger if exists trg_10_validate_profile_relations on public.categories;
create trigger trg_10_validate_profile_relations before insert or update on public.categories
  for each row execute function public.validate_profile_relations();
drop trigger if exists trg_10_validate_profile_relations on public.monthly_balances;
create trigger trg_10_validate_profile_relations before insert or update on public.monthly_balances
  for each row execute function public.validate_profile_relations();
drop trigger if exists trg_10_validate_profile_relations on public.imports;
create trigger trg_10_validate_profile_relations before insert or update on public.imports
  for each row execute function public.validate_profile_relations();
drop trigger if exists trg_10_validate_profile_relations on public.budgets;
create trigger trg_10_validate_profile_relations before insert or update on public.budgets
  for each row execute function public.validate_profile_relations();
drop trigger if exists trg_10_validate_profile_relations on public.recurring_transactions;
create trigger trg_10_validate_profile_relations before insert or update on public.recurring_transactions
  for each row execute function public.validate_profile_relations();

-- O PF não pode ser apagado, arquivado nem virar PJ. Exceção: exclusão da
-- conta (cascata de auth.users), quando o usuário já não existe mais.
create or replace function public.protect_pf_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.kind <> 'pf' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    if exists (select 1 from auth.users u where u.id = old.user_id) then
      raise exception 'O perfil pessoal (PF) não pode ser removido ou arquivado' using errcode = '23514';
    end if;
    return old;
  end if;

  if new.archived or new.kind <> 'pf' then
    raise exception 'O perfil pessoal (PF) não pode ser removido ou arquivado' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.protect_pf_profile() from public, anon, authenticated;

drop trigger if exists trg_protect_pf_profile on public.financial_profiles;
create trigger trg_protect_pf_profile before update or delete on public.financial_profiles
  for each row execute function public.protect_pf_profile();

-- 6) Signup cria o perfil PF ---------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));

  insert into public.financial_profiles (user_id, kind, name)
  values (
    new.id,
    'pf',
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(split_part(new.email, '@', 1), ''),
      'Você'
    )
  )
  on conflict (user_id) where kind = 'pf' do nothing;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 7) Recorrências: o lançamento gerado herda o perfil da regra ----------------
-- (mesma função de 20260822000006, com profile_id nos três inserts)
create or replace function public.generate_recurring_transactions(
  target_year int,
  target_month int,
  include_manual boolean default false
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_month_start date;
  v_next_month date;
  v_month_end date;
  v_rule public.recurring_transactions%rowtype;
  v_occurrence date;
  v_step_days int;
  v_delta_days int;
  v_last_day int;
  v_row_count int;
  v_inserted int := 0;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado' using errcode = '42501';
  end if;

  if target_year not between 2020 and 2100 or target_month not between 1 and 12 then
    raise exception 'Período inválido' using errcode = '22023';
  end if;

  v_month_start := make_date(target_year, target_month, 1);
  v_next_month := (v_month_start + interval '1 month')::date;
  v_month_end := v_next_month - 1;
  v_last_day := extract(day from v_month_end)::int;

  for v_rule in
    select *
    from public.recurring_transactions r
    where r.user_id = v_user_id
      and r.active = true
      and (r.auto_generate = true or include_manual = true)
      and r.starts_on < v_next_month
      and (r.ends_on is null or r.ends_on >= v_month_start)
    order by r.created_at, r.id
  loop
    if v_rule.frequency = 'monthly' then
      v_occurrence := make_date(
        target_year,
        target_month,
        least(coalesce(v_rule.day_of_month, extract(day from v_rule.starts_on)::int), v_last_day)
      );

      if v_occurrence >= v_rule.starts_on
         and (v_rule.ends_on is null or v_occurrence <= v_rule.ends_on) then
        insert into public.transactions (
          user_id, occurred_on, amount, kind, category_id, subcategory_id,
          reserve_id, description, notes, source, profile_id,
          recurring_rule_id, recurring_occurrence_date
        ) values (
          v_user_id, v_occurrence, v_rule.amount, v_rule.kind,
          v_rule.category_id, v_rule.subcategory_id, v_rule.reserve_id,
          v_rule.name, v_rule.notes, 'manual', v_rule.profile_id,
          v_rule.id, v_occurrence
        )
        on conflict (recurring_rule_id, recurring_occurrence_date) do nothing;
        get diagnostics v_row_count = row_count;
        v_inserted := v_inserted + v_row_count;
      end if;

    elsif v_rule.frequency = 'yearly' then
      if v_rule.month_of_year = target_month then
        v_occurrence := make_date(
          target_year,
          target_month,
          least(coalesce(v_rule.day_of_month, extract(day from v_rule.starts_on)::int), v_last_day)
        );

        if v_occurrence >= v_rule.starts_on
           and (v_rule.ends_on is null or v_occurrence <= v_rule.ends_on) then
          insert into public.transactions (
            user_id, occurred_on, amount, kind, category_id, subcategory_id,
            reserve_id, description, notes, source, profile_id,
            recurring_rule_id, recurring_occurrence_date
          ) values (
            v_user_id, v_occurrence, v_rule.amount, v_rule.kind,
            v_rule.category_id, v_rule.subcategory_id, v_rule.reserve_id,
            v_rule.name, v_rule.notes, 'manual', v_rule.profile_id,
            v_rule.id, v_occurrence
          )
          on conflict (recurring_rule_id, recurring_occurrence_date) do nothing;
          get diagnostics v_row_count = row_count;
          v_inserted := v_inserted + v_row_count;
        end if;
      end if;

    elsif v_rule.frequency in ('weekly', 'biweekly') then
      v_step_days := case when v_rule.frequency = 'weekly' then 7 else 14 end;
      v_occurrence := v_rule.starts_on;

      if v_occurrence < v_month_start then
        v_delta_days := v_month_start - v_occurrence;
        v_occurrence := v_occurrence
          + ((((v_delta_days + v_step_days - 1) / v_step_days)) * v_step_days);
      end if;

      while v_occurrence < v_next_month loop
        exit when v_rule.ends_on is not null and v_occurrence > v_rule.ends_on;

        insert into public.transactions (
          user_id, occurred_on, amount, kind, category_id, subcategory_id,
          reserve_id, description, notes, source, profile_id,
          recurring_rule_id, recurring_occurrence_date
        ) values (
          v_user_id, v_occurrence, v_rule.amount, v_rule.kind,
          v_rule.category_id, v_rule.subcategory_id, v_rule.reserve_id,
          v_rule.name, v_rule.notes, 'manual', v_rule.profile_id,
          v_rule.id, v_occurrence
        )
        on conflict (recurring_rule_id, recurring_occurrence_date) do nothing;
        get diagnostics v_row_count = row_count;
        v_inserted := v_inserted + v_row_count;

        v_occurrence := v_occurrence + v_step_days;
      end loop;
    end if;
  end loop;

  return v_inserted;
end;
$$;

revoke all on function public.generate_recurring_transactions(int, int, boolean) from public;

grant execute on function public.generate_recurring_transactions(int, int, boolean) to authenticated;

-- 8) Resumo mensal por perfil ---------------------------------------------------
-- target_profile = id  → só aquele perfil (com a própria âncora de saldo inicial);
-- target_profile = null → consolidado: soma, perfil a perfil, do cálculo individual.
create or replace function public.get_monthly_financial_summary(
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
  transactions_count bigint
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
      coalesce(a.opening_balance, 0) + coalesce((
        select sum(
          case t.kind
            when 'receita' then t.amount
            when 'despesa' then -t.amount
            when 'reserva' then -t.amount
          end
        )
        from public.transactions t
        where t.user_id = auth.uid()
          and t.profile_id = fp.id
          and t.occurred_on < p.month_start
          and (a.anchor_month is null or t.occurred_on >= a.anchor_month)
      ), 0) as opening_balance,
      m.receita,
      m.despesa,
      m.aportes,
      m.tx_count
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
        count(t.id) as tx_count
      from public.transactions t
      where t.user_id = auth.uid()
        and t.profile_id = fp.id
        and t.occurred_on >= p.month_start
        and t.occurred_on < p.next_month
    ) m
    where fp.user_id = auth.uid()
      and (target_profile is null or fp.id = target_profile)
  ),
  totals as (
    select
      coalesce(sum(opening_balance), 0) as opening_balance,
      coalesce(sum(receita), 0) as receita,
      coalesce(sum(despesa), 0) as despesa,
      coalesce(sum(aportes), 0) as aportes,
      coalesce(sum(tx_count), 0)::bigint as tx_count
    from per_profile
  )
  select
    p.month_start,
    o.opening_balance,
    o.receita,
    o.despesa,
    o.receita - o.despesa,
    o.aportes,
    o.opening_balance + o.receita - o.despesa,
    o.opening_balance + o.receita - o.despesa - o.aportes,
    o.tx_count
  from params p
  cross join totals o;
$$;

revoke all on function public.get_monthly_financial_summary(int, int, uuid) from public;
revoke all on function public.get_monthly_financial_summary(int, int, uuid) from anon;
grant execute on function public.get_monthly_financial_summary(int, int, uuid) to authenticated;

-- Assinatura usada pelo app hoje: passa a ser o consolidado (idêntico ao
-- comportamento anterior enquanto todo usuário só tem o perfil PF).
create or replace function public.get_monthly_financial_summary(
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
  transactions_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select * from public.get_monthly_financial_summary(target_year, target_month, null::uuid);
$$;
