-- ============================================================================
-- Norte / Valoria — hardening de segurança e integridade
-- Mantém compatibilidade com o schema já publicado.
-- ============================================================================

-- 1) Resumo mensal: evita NULL quando um tipo de lançamento não existe no mês.
create or replace view public.monthly_summary
with (security_invoker = true)
as
select
  user_id,
  date_trunc('month', occurred_on)::date as month,
  extract(year from occurred_on)::int as year,
  extract(month from occurred_on)::int as month_num,
  coalesce(sum(amount) filter (where kind = 'receita'), 0) as total_receita,
  coalesce(sum(amount) filter (where kind = 'despesa'), 0) as total_despesa,
  coalesce(sum(amount) filter (where kind = 'reserva'), 0) as total_reserva,
  coalesce(sum(amount) filter (where kind = 'receita'), 0)
    - coalesce(sum(amount) filter (where kind = 'despesa'), 0)
    - coalesce(sum(amount) filter (where kind = 'reserva'), 0) as resultado_liquido,
  count(*) as transactions_count
from public.transactions
group by user_id, date_trunc('month', occurred_on), year, month_num;

-- 2) Seed seguro e idempotente.
-- Preserva a assinatura existente para não quebrar o frontend/callback já publicado.
create or replace function public.seed_default_categories(target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_user uuid := auth.uid();
  cat_id uuid;
begin
  if caller_user is null or target_user is distinct from caller_user then
    raise exception 'Não autorizado' using errcode = '42501';
  end if;

  insert into public.categories (user_id, name, kind, color, sort_order) values
    (target_user, 'Salário',          'receita', '#B99154', 1),
    (target_user, 'Rendimento',       'receita', '#B99154', 2),
    (target_user, 'Renda Extra',      'receita', '#B99154', 3),
    (target_user, 'Outros',           'receita', '#B99154', 4)
  on conflict (user_id, name, kind) do nothing;

  insert into public.categories (user_id, name, kind, color, sort_order, "group") values
    (target_user, 'Reserva de Emergência',    'reserva', '#0A2E20', 1, 'construcao'),
    (target_user, 'Independência Financeira', 'reserva', '#0A2E20', 2, 'construcao'),
    (target_user, 'Objetivos',                 'reserva', '#0A2E20', 3, 'construcao'),
    (target_user, 'Casa',                      'despesa', '#0A2E20', 1, 'necessidades'),
    (target_user, 'Transporte',                'despesa', '#0A2E20', 2, 'necessidades'),
    (target_user, 'Alimentação',               'despesa', '#0A2E20', 3, 'necessidades'),
    (target_user, 'Crianças',                  'despesa', '#9FA88A', 4, 'necessidades'),
    (target_user, 'Saúde',                     'despesa', '#9FA88A', 5, 'necessidades'),
    (target_user, 'Lazer',                     'despesa', '#B99154', 6, 'estilo'),
    (target_user, 'Gastos Pessoais',           'despesa', '#B99154', 7, 'estilo'),
    (target_user, 'Férias/Viagens',            'despesa', '#B99154', 8, 'estilo'),
    (target_user, 'Pet',                       'despesa', '#B99154', 9, 'livre'),
    (target_user, 'Custos Financeiros',        'despesa', '#78716c', 10, 'livre')
  on conflict (user_id, name, kind) do nothing;

  select id into cat_id
  from public.categories
  where user_id = target_user and name = 'Casa' and kind = 'despesa';

  insert into public.subcategories (category_id, user_id, name, sort_order) values
    (cat_id, target_user, 'Aluguel/Financiamento', 1),
    (cat_id, target_user, 'Energia', 2),
    (cat_id, target_user, 'Água', 3),
    (cat_id, target_user, 'Internet', 4),
    (cat_id, target_user, 'Condomínio', 5),
    (cat_id, target_user, 'Melhorias', 6)
  on conflict (category_id, name) do nothing;

  select id into cat_id
  from public.categories
  where user_id = target_user and name = 'Transporte' and kind = 'despesa';

  insert into public.subcategories (category_id, user_id, name, sort_order) values
    (cat_id, target_user, 'Combustível', 1),
    (cat_id, target_user, 'Manutenção', 2),
    (cat_id, target_user, 'Seguro', 3),
    (cat_id, target_user, 'IPVA', 4),
    (cat_id, target_user, 'Estacionamento', 5)
  on conflict (category_id, name) do nothing;

  select id into cat_id
  from public.categories
  where user_id = target_user and name = 'Alimentação' and kind = 'despesa';

  insert into public.subcategories (category_id, user_id, name, sort_order) values
    (cat_id, target_user, 'Supermercado', 1),
    (cat_id, target_user, 'Restaurantes', 2),
    (cat_id, target_user, 'Delivery', 3),
    (cat_id, target_user, 'Padaria', 4)
  on conflict (category_id, name) do nothing;

  update public.profiles
  set onboarded_at = coalesce(onboarded_at, now())
  where id = target_user;
end;
$$;

revoke all on function public.seed_default_categories(uuid) from public;
revoke all on function public.seed_default_categories(uuid) from anon;
grant execute on function public.seed_default_categories(uuid) to authenticated;

-- 3) Integridade entre user_id, categorias e subcategorias.
create or replace function public.validate_subcategory_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.categories c
    where c.id = new.category_id and c.user_id = new.user_id
  ) then
    raise exception 'Categoria inválida para este usuário' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_subcategory_owner on public.subcategories;
create trigger trg_validate_subcategory_owner
before insert or update of category_id, user_id on public.subcategories
for each row execute function public.validate_subcategory_owner();

create or replace function public.validate_transaction_relations()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  category_kind public.transaction_kind;
  subcategory_category uuid;
begin
  if new.category_id is not null then
    select c.kind into category_kind
    from public.categories c
    where c.id = new.category_id and c.user_id = new.user_id;

    if category_kind is null then
      raise exception 'Categoria inválida para este usuário' using errcode = '23514';
    end if;

    if category_kind <> new.kind then
      raise exception 'Categoria incompatível com o tipo do lançamento' using errcode = '23514';
    end if;
  end if;

  if new.subcategory_id is not null then
    select s.category_id into subcategory_category
    from public.subcategories s
    where s.id = new.subcategory_id and s.user_id = new.user_id;

    if subcategory_category is null then
      raise exception 'Subcategoria inválida para este usuário' using errcode = '23514';
    end if;

    if new.category_id is null or subcategory_category <> new.category_id then
      raise exception 'Subcategoria incompatível com a categoria' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_transaction_relations on public.transactions;
create trigger trg_validate_transaction_relations
before insert or update of user_id, kind, category_id, subcategory_id on public.transactions
for each row execute function public.validate_transaction_relations();

create or replace function public.validate_budget_category_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.categories c
    where c.id = new.category_id and c.user_id = new.user_id
  ) then
    raise exception 'Categoria inválida para este orçamento' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_budget_category_owner on public.budgets;
create trigger trg_validate_budget_category_owner
before insert or update of category_id, user_id on public.budgets
for each row execute function public.validate_budget_category_owner();
