-- ============================================================================
-- Valoria — Parte 2: orçamento planejado x realizado
-- Evolui a tabela budgets existente para suportar detalhamento por subcategoria
-- sem duplicar o valor realizado dos lançamentos.
-- ============================================================================

-- 1) Orçamento pode ser definido no nível da categoria OU detalhado por
-- subcategoria. Em um mesmo mês/categoria a aplicação mantém apenas um modo.
alter table public.budgets
  add column if not exists subcategory_id uuid references public.subcategories(id) on delete cascade,
  add column if not exists origin text not null default 'manual';

alter table public.budgets
  drop constraint if exists budgets_origin_check,
  add constraint budgets_origin_check
    check (origin in ('manual', 'planning', 'copied'));

-- A constraint antiga permitia apenas um registro por categoria/mês e impedia
-- detalhamento. Ela é substituída por índices parciais.
alter table public.budgets
  drop constraint if exists budgets_user_id_category_id_year_month_key;

drop index if exists public.uq_budgets_category_month;

drop index if exists public.uq_budgets_subcategory_month;

create unique index uq_budgets_category_month
  on public.budgets(user_id, category_id, year, month)
  where subcategory_id is null;

create unique index uq_budgets_subcategory_month
  on public.budgets(user_id, subcategory_id, year, month)
  where subcategory_id is not null;

create index if not exists idx_budgets_subcategory
  on public.budgets(subcategory_id)
  where subcategory_id is not null;

-- 2) Integridade: uma subcategoria de orçamento precisa pertencer à categoria
-- e ao mesmo usuário do registro.
create or replace function public.validate_budget_item()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.categories c
    where c.id = new.category_id
      and c.user_id = new.user_id
  ) then
    raise exception 'Categoria inválida para este orçamento' using errcode = '23514';
  end if;

  if new.subcategory_id is not null and not exists (
    select 1
    from public.subcategories s
    where s.id = new.subcategory_id
      and s.category_id = new.category_id
      and s.user_id = new.user_id
  ) then
    raise exception 'Subcategoria inválida para este orçamento' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_budget_item on public.budgets;

create trigger trg_validate_budget_item
before insert or update of user_id, category_id, subcategory_id
on public.budgets
for each row execute function public.validate_budget_item();

comment on column public.budgets.subcategory_id is
  'Null = orçamento agregado da categoria. Preenchido = orçamento detalhado da subcategoria.';

comment on column public.budgets.origin is
  'Origem do valor planejado: manual, planejamento padrão ou cópia de outro mês.';

-- 3) Operações que trocam o modo agregado/detalhado precisam ser atômicas.
-- As RPCs abaixo evitam que uma falha entre DELETE e INSERT deixe o mês sem
-- o orçamento anterior.
create or replace function public.set_budget_amount(
  target_category_id uuid,
  target_subcategory_id uuid,
  target_year int,
  target_month int,
  target_amount numeric
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user uuid := auth.uid();
begin
  if current_user is null then
    raise exception 'Usuário não autenticado' using errcode = '42501';
  end if;

  if target_year not between 2020 and 2100
     or target_month not between 1 and 12
     or target_amount < 0 then
    raise exception 'Dados de orçamento inválidos' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.categories c
    where c.id = target_category_id
      and c.user_id = current_user
      and c.archived = false
  ) then
    raise exception 'Categoria não encontrada' using errcode = '23514';
  end if;

  if target_subcategory_id is not null and not exists (
    select 1 from public.subcategories s
    where s.id = target_subcategory_id
      and s.category_id = target_category_id
      and s.user_id = current_user
      and s.archived = false
  ) then
    raise exception 'Subcategoria não encontrada' using errcode = '23514';
  end if;

  if target_subcategory_id is not null then
    delete from public.budgets
    where user_id = current_user
      and category_id = target_category_id
      and year = target_year
      and month = target_month
      and subcategory_id is null;

    if target_amount = 0 then
      delete from public.budgets
      where user_id = current_user
        and category_id = target_category_id
        and subcategory_id = target_subcategory_id
        and year = target_year
        and month = target_month;
    else
      update public.budgets
      set planned_amount = target_amount,
          origin = 'manual'
      where user_id = current_user
        and category_id = target_category_id
        and subcategory_id = target_subcategory_id
        and year = target_year
        and month = target_month;

      if not found then
        insert into public.budgets (
          user_id, category_id, subcategory_id, year, month, planned_amount, origin
        ) values (
          current_user, target_category_id, target_subcategory_id,
          target_year, target_month, target_amount, 'manual'
        );
      end if;
    end if;
  else
    delete from public.budgets
    where user_id = current_user
      and category_id = target_category_id
      and year = target_year
      and month = target_month
      and subcategory_id is not null;

    if target_amount = 0 then
      delete from public.budgets
      where user_id = current_user
        and category_id = target_category_id
        and year = target_year
        and month = target_month
        and subcategory_id is null;
    else
      update public.budgets
      set planned_amount = target_amount,
          origin = 'manual'
      where user_id = current_user
        and category_id = target_category_id
        and year = target_year
        and month = target_month
        and subcategory_id is null;

      if not found then
        insert into public.budgets (
          user_id, category_id, subcategory_id, year, month, planned_amount, origin
        ) values (
          current_user, target_category_id, null,
          target_year, target_month, target_amount, 'manual'
        );
      end if;
    end if;
  end if;
end;
$$;

create or replace function public.copy_budget_month(
  source_year int,
  source_month int,
  target_year int,
  target_month int
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user uuid := auth.uid();
  copied_count integer;
begin
  if current_user is null then
    raise exception 'Usuário não autenticado' using errcode = '42501';
  end if;

  if source_year not between 2020 and 2100
     or target_year not between 2020 and 2100
     or source_month not between 1 and 12
     or target_month not between 1 and 12 then
    raise exception 'Período inválido' using errcode = '22023';
  end if;

  if source_year = target_year and source_month = target_month then
    raise exception 'O mês de origem precisa ser diferente do mês de destino' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.budgets
    where user_id = current_user
      and year = source_year
      and month = source_month
  ) then
    raise exception 'O mês de origem não possui orçamento' using errcode = 'P0001';
  end if;

  delete from public.budgets
  where user_id = current_user
    and year = target_year
    and month = target_month;

  insert into public.budgets (
    user_id, category_id, subcategory_id, year, month, planned_amount, origin
  )
  select
    current_user,
    category_id,
    subcategory_id,
    target_year,
    target_month,
    planned_amount,
    'copied'
  from public.budgets
  where user_id = current_user
    and year = source_year
    and month = source_month;

  get diagnostics copied_count = row_count;
  return copied_count;
end;
$$;

revoke all on function public.set_budget_amount(uuid, uuid, int, int, numeric) from public;

revoke all on function public.copy_budget_month(int, int, int, int) from public;

grant execute on function public.set_budget_amount(uuid, uuid, int, int, numeric) to authenticated;

grant execute on function public.copy_budget_month(int, int, int, int) to authenticated;
