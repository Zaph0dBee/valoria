-- ============================================================================
-- Valoria — Parte 1.1: planejamento por categoria e subcategoria
-- Adiciona parâmetros de planejamento sem misturar valores realizados.
-- ============================================================================

-- 1) Configurações de planejamento nas categorias.
alter table public.categories
  add column if not exists planned_amount numeric(14, 2),
  add column if not exists recurrence text not null default 'none',
  add column if not exists day_of_month smallint,
  add column if not exists expense_nature text,
  add column if not exists include_in_budget boolean not null default true,
  add column if not exists planning_notes text,
  add column if not exists default_reserve_id uuid references public.reserves(id) on delete set null;

alter table public.categories
  drop constraint if exists categories_planned_amount_check,
  add constraint categories_planned_amount_check
    check (planned_amount is null or planned_amount >= 0),
  drop constraint if exists categories_recurrence_check,
  add constraint categories_recurrence_check
    check (recurrence in ('none', 'weekly', 'biweekly', 'monthly', 'yearly')),
  drop constraint if exists categories_day_of_month_check,
  add constraint categories_day_of_month_check
    check (day_of_month is null or day_of_month between 1 and 31),
  drop constraint if exists categories_expense_nature_check,
  add constraint categories_expense_nature_check
    check (expense_nature is null or expense_nature in ('fixa', 'variavel'));

create index if not exists idx_categories_default_reserve
  on public.categories(default_reserve_id)
  where default_reserve_id is not null;

-- 2) Configurações de planejamento nas subcategorias.
alter table public.subcategories
  add column if not exists planned_amount numeric(14, 2),
  add column if not exists recurrence text not null default 'none',
  add column if not exists day_of_month smallint,
  add column if not exists expense_nature text,
  add column if not exists include_in_budget boolean not null default true,
  add column if not exists planning_notes text,
  add column if not exists default_reserve_id uuid references public.reserves(id) on delete set null,
  add column if not exists group_override public.category_group;

alter table public.subcategories
  drop constraint if exists subcategories_planned_amount_check,
  add constraint subcategories_planned_amount_check
    check (planned_amount is null or planned_amount >= 0),
  drop constraint if exists subcategories_recurrence_check,
  add constraint subcategories_recurrence_check
    check (recurrence in ('none', 'weekly', 'biweekly', 'monthly', 'yearly')),
  drop constraint if exists subcategories_day_of_month_check,
  add constraint subcategories_day_of_month_check
    check (day_of_month is null or day_of_month between 1 and 31),
  drop constraint if exists subcategories_expense_nature_check,
  add constraint subcategories_expense_nature_check
    check (expense_nature is null or expense_nature in ('fixa', 'variavel'));

create index if not exists idx_subcategories_default_reserve
  on public.subcategories(default_reserve_id)
  where default_reserve_id is not null;

-- 3) Integridade: meta vinculada precisa pertencer ao mesmo usuário e fazer
-- sentido para o tipo da categoria.
create or replace function public.validate_category_planning()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.kind = 'receita' then
    if new."group" is not null then
      raise exception 'Receitas não usam grupo Valoria/NCE' using errcode = '23514';
    end if;
    if new.expense_nature is not null then
      raise exception 'Receitas não usam classificação fixa/variável' using errcode = '23514';
    end if;
    if new.default_reserve_id is not null then
      raise exception 'Receitas não podem ser vinculadas a uma meta' using errcode = '23514';
    end if;
  elsif new.kind = 'despesa' then
    if new.default_reserve_id is not null then
      raise exception 'Despesas não podem ser vinculadas a uma meta' using errcode = '23514';
    end if;
  elsif new.kind = 'reserva' then
    new."group" := coalesce(new."group", 'construcao');
    if new.expense_nature is not null then
      raise exception 'Aportes não usam classificação fixa/variável' using errcode = '23514';
    end if;
  end if;

  if new.default_reserve_id is not null and not exists (
    select 1 from public.reserves r
    where r.id = new.default_reserve_id
      and r.user_id = new.user_id
      and r.archived = false
  ) then
    raise exception 'Meta vinculada inválida para este usuário' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_category_planning on public.categories;
create trigger trg_validate_category_planning
before insert or update of user_id, kind, "group", expense_nature, default_reserve_id
on public.categories
for each row execute function public.validate_category_planning();

create or replace function public.validate_subcategory_planning()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_kind public.transaction_kind;
  parent_user uuid;
begin
  select c.kind, c.user_id into parent_kind, parent_user
  from public.categories c
  where c.id = new.category_id;

  if parent_kind is null or parent_user is distinct from new.user_id then
    raise exception 'Categoria inválida para esta subcategoria' using errcode = '23514';
  end if;

  if parent_kind = 'receita' then
    if new.group_override is not null then
      raise exception 'Receitas não usam grupo Valoria/NCE' using errcode = '23514';
    end if;
    if new.expense_nature is not null then
      raise exception 'Receitas não usam classificação fixa/variável' using errcode = '23514';
    end if;
    if new.default_reserve_id is not null then
      raise exception 'Receitas não podem ser vinculadas a uma meta' using errcode = '23514';
    end if;
  elsif parent_kind = 'despesa' then
    if new.default_reserve_id is not null then
      raise exception 'Despesas não podem ser vinculadas a uma meta' using errcode = '23514';
    end if;
  elsif parent_kind = 'reserva' then
    if new.expense_nature is not null then
      raise exception 'Aportes não usam classificação fixa/variável' using errcode = '23514';
    end if;
  end if;

  if new.default_reserve_id is not null and not exists (
    select 1 from public.reserves r
    where r.id = new.default_reserve_id
      and r.user_id = new.user_id
      and r.archived = false
  ) then
    raise exception 'Meta vinculada inválida para este usuário' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_subcategory_planning on public.subcategories;
create trigger trg_validate_subcategory_planning
before insert or update of category_id, user_id, group_override, expense_nature, default_reserve_id
on public.subcategories
for each row execute function public.validate_subcategory_planning();

-- 4) A distribuição Valoria/NCE passa a aceitar uma classificação específica
-- da subcategoria. Se não houver override, herda o grupo da categoria.
create or replace view public.nce_distribution
with (security_invoker = true)
as
select
  t.user_id,
  date_trunc('month', t.occurred_on)::date as month,
  coalesce(s.group_override, c."group") as group_name,
  sum(t.amount) as total,
  count(*) as transactions_count
from public.transactions t
join public.categories c on c.id = t.category_id
left join public.subcategories s on s.id = t.subcategory_id
where t.kind = 'despesa' or t.kind = 'reserva'
group by
  t.user_id,
  date_trunc('month', t.occurred_on),
  coalesce(s.group_override, c."group");

comment on column public.categories.planned_amount is
  'Valor mensal padrão de planejamento. O realizado continua vindo de transactions.';
comment on column public.subcategories.planned_amount is
  'Valor mensal padrão de planejamento. Na Parte 2 poderá alimentar o orçamento mensal.';
comment on column public.subcategories.group_override is
  'Grupo Valoria específico da subcategoria. Null = herdar o grupo da categoria.';
