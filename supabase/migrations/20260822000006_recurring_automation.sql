-- ============================================================================
-- Valoria — Parte 3: automações e recorrências
-- Contas previstas, vencimentos, geração idempotente e projeção recorrente.
-- ============================================================================

create table if not exists public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind public.transaction_kind not null,
  amount numeric(14, 2) not null check (amount > 0),
  category_id uuid references public.categories(id) on delete set null,
  subcategory_id uuid references public.subcategories(id) on delete set null,
  reserve_id uuid references public.reserves(id) on delete set null,
  frequency text not null default 'monthly'
    check (frequency in ('weekly', 'biweekly', 'monthly', 'yearly')),
  day_of_month smallint check (day_of_month between 1 and 31),
  month_of_year smallint check (month_of_year between 1 and 12),
  starts_on date not null default current_date,
  ends_on date,
  auto_generate boolean not null default true,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on),
  check (
    (frequency in ('weekly', 'biweekly'))
    or (frequency = 'monthly' and day_of_month is not null)
    or (frequency = 'yearly' and day_of_month is not null and month_of_year is not null)
  )
);

create index if not exists idx_recurring_transactions_user_active
  on public.recurring_transactions(user_id, active, kind);

create index if not exists idx_recurring_transactions_category
  on public.recurring_transactions(category_id)
  where category_id is not null;

alter table public.recurring_transactions enable row level security;

drop policy if exists "recurring_transactions: dono tudo" on public.recurring_transactions;

create policy "recurring_transactions: dono tudo" on public.recurring_transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists trg_recurring_transactions_updated on public.recurring_transactions;

create trigger trg_recurring_transactions_updated
before update on public.recurring_transactions
for each row execute function public.set_updated_at();

-- Liga um lançamento gerado à regra e à ocorrência que lhe deu origem.
alter table public.transactions
  add column if not exists recurring_rule_id uuid references public.recurring_transactions(id) on delete set null,
  add column if not exists recurring_occurrence_date date;

alter table public.transactions
  drop constraint if exists transactions_recurring_occurrence_pair_check,
  add constraint transactions_recurring_occurrence_pair_check check (
    (recurring_rule_id is null and recurring_occurrence_date is null)
    or (recurring_rule_id is not null and recurring_occurrence_date is not null)
  );

alter table public.transactions
  drop constraint if exists transactions_recurring_rule_occurrence_key,
  add constraint transactions_recurring_rule_occurrence_key
    unique (recurring_rule_id, recurring_occurrence_date);

create index if not exists idx_transactions_recurring_rule
  on public.transactions(recurring_rule_id)
  where recurring_rule_id is not null;

-- Valida relações da regra mesmo em chamadas diretas pela API.
create or replace function public.validate_recurring_rule_relations()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_category_kind public.transaction_kind;
  v_subcategory_category uuid;
begin
  if new.category_id is not null then
    select c.kind into v_category_kind
    from public.categories c
    where c.id = new.category_id
      and c.user_id = new.user_id
      and c.archived = false;

    if v_category_kind is null then
      raise exception 'Categoria inválida para esta recorrência' using errcode = '23514';
    end if;

    if v_category_kind <> new.kind then
      raise exception 'Categoria incompatível com o tipo da recorrência' using errcode = '23514';
    end if;
  end if;

  if new.subcategory_id is not null then
    select s.category_id into v_subcategory_category
    from public.subcategories s
    where s.id = new.subcategory_id
      and s.user_id = new.user_id
      and s.archived = false;

    if v_subcategory_category is null
       or new.category_id is null
       or v_subcategory_category <> new.category_id then
      raise exception 'Subcategoria incompatível com a recorrência' using errcode = '23514';
    end if;
  end if;

  if new.reserve_id is not null then
    if new.kind <> 'reserva' then
      raise exception 'Somente aportes recorrentes podem ser vinculados a uma meta' using errcode = '23514';
    end if;

    if not exists (
      select 1 from public.reserves r
      where r.id = new.reserve_id
        and r.user_id = new.user_id
        and r.archived = false
    ) then
      raise exception 'Meta inválida para esta recorrência' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_recurring_rule_relations on public.recurring_transactions;

create trigger trg_validate_recurring_rule_relations
before insert or update of user_id, kind, category_id, subcategory_id, reserve_id
on public.recurring_transactions
for each row execute function public.validate_recurring_rule_relations();

-- Impede que um lançamento seja vinculado à recorrência de outro usuário.
create or replace function public.validate_transaction_recurring_relation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.recurring_rule_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.recurring_transactions r
    where r.id = new.recurring_rule_id
      and r.user_id = new.user_id
  ) then
    raise exception 'Recorrência inválida para este usuário' using errcode = '23514';
  end if;

  if new.recurring_occurrence_date is distinct from new.occurred_on then
    raise exception 'A data da ocorrência deve ser igual à data do lançamento' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_transaction_recurring_relation on public.transactions;

create trigger trg_validate_transaction_recurring_relation
before insert or update of user_id, recurring_rule_id, recurring_occurrence_date, occurred_on
on public.transactions
for each row execute function public.validate_transaction_recurring_relation();

-- Gera lançamentos de um mês sem duplicar ocorrências já existentes.
-- include_manual=false: somente regras marcadas para geração automática.
-- include_manual=true: inclui também as regras que exigem geração manual.
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
          reserve_id, description, notes, source,
          recurring_rule_id, recurring_occurrence_date
        ) values (
          v_user_id, v_occurrence, v_rule.amount, v_rule.kind,
          v_rule.category_id, v_rule.subcategory_id, v_rule.reserve_id,
          v_rule.name, v_rule.notes, 'manual',
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
            reserve_id, description, notes, source,
            recurring_rule_id, recurring_occurrence_date
          ) values (
            v_user_id, v_occurrence, v_rule.amount, v_rule.kind,
            v_rule.category_id, v_rule.subcategory_id, v_rule.reserve_id,
            v_rule.name, v_rule.notes, 'manual',
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
          reserve_id, description, notes, source,
          recurring_rule_id, recurring_occurrence_date
        ) values (
          v_user_id, v_occurrence, v_rule.amount, v_rule.kind,
          v_rule.category_id, v_rule.subcategory_id, v_rule.reserve_id,
          v_rule.name, v_rule.notes, 'manual',
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
