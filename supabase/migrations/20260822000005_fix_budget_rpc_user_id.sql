-- ============================================================================
-- Valoria — Hotfix Parte 2
-- Corrige colisão com CURRENT_USER (tipo PostgreSQL `name`) nas RPCs de orçamento.
-- ============================================================================

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
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
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
      and c.user_id = v_user_id
      and c.archived = false
  ) then
    raise exception 'Categoria não encontrada' using errcode = '23514';
  end if;

  if target_subcategory_id is not null and not exists (
    select 1 from public.subcategories s
    where s.id = target_subcategory_id
      and s.category_id = target_category_id
      and s.user_id = v_user_id
      and s.archived = false
  ) then
    raise exception 'Subcategoria não encontrada' using errcode = '23514';
  end if;

  if target_subcategory_id is not null then
    delete from public.budgets
    where user_id = v_user_id
      and category_id = target_category_id
      and year = target_year
      and month = target_month
      and subcategory_id is null;

    if target_amount = 0 then
      delete from public.budgets
      where user_id = v_user_id
        and category_id = target_category_id
        and subcategory_id = target_subcategory_id
        and year = target_year
        and month = target_month;
    else
      update public.budgets
      set planned_amount = target_amount,
          origin = 'manual'
      where user_id = v_user_id
        and category_id = target_category_id
        and subcategory_id = target_subcategory_id
        and year = target_year
        and month = target_month;

      if not found then
        insert into public.budgets (
          user_id, category_id, subcategory_id, year, month, planned_amount, origin
        ) values (
          v_user_id, target_category_id, target_subcategory_id,
          target_year, target_month, target_amount, 'manual'
        );
      end if;
    end if;
  else
    delete from public.budgets
    where user_id = v_user_id
      and category_id = target_category_id
      and year = target_year
      and month = target_month
      and subcategory_id is not null;

    if target_amount = 0 then
      delete from public.budgets
      where user_id = v_user_id
        and category_id = target_category_id
        and year = target_year
        and month = target_month
        and subcategory_id is null;
    else
      update public.budgets
      set planned_amount = target_amount,
          origin = 'manual'
      where user_id = v_user_id
        and category_id = target_category_id
        and year = target_year
        and month = target_month
        and subcategory_id is null;

      if not found then
        insert into public.budgets (
          user_id, category_id, subcategory_id, year, month, planned_amount, origin
        ) values (
          v_user_id, target_category_id, null,
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
  v_user_id uuid := auth.uid();
  copied_count integer;
begin
  if v_user_id is null then
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
    where user_id = v_user_id
      and year = source_year
      and month = source_month
  ) then
    raise exception 'O mês de origem não possui orçamento' using errcode = 'P0001';
  end if;

  delete from public.budgets
  where user_id = v_user_id
    and year = target_year
    and month = target_month;

  insert into public.budgets (
    user_id, category_id, subcategory_id, year, month, planned_amount, origin
  )
  select
    v_user_id,
    category_id,
    subcategory_id,
    target_year,
    target_month,
    planned_amount,
    'copied'
  from public.budgets
  where user_id = v_user_id
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
