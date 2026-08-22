-- ============================================================================
-- Valoria — Fase 1: Grupos NCE (Necessidades / Construção / Estilo / Livre)
-- Adiciona classificação de grupos em categorias, sem quebrar dados existentes
-- ============================================================================

-- 1. Enum de grupos Valoria
create type category_group as enum ('necessidades', 'construcao', 'estilo', 'livre');

-- 2. Coluna nas categorias (nullable — categorias antigas ficam sem grupo até serem editadas)
alter table public.categories
  add column if not exists "group" category_group;

comment on column public.categories."group" is
  'Grupo Valoria: necessidades (moradia, alimentação básica, transporte, saúde), '
  'construcao (investimentos, reservas, aportes, quitação), '
  'estilo (restaurantes, delivery, roupas, beleza, lazer), '
  'livre (variável, sem impacto de longo prazo). '
  'Null = ainda não classificada.';

-- 3. Popular grupos das categorias criadas via template (best-effort, por nome padrão)
-- Isso só afeta usuários que aceitaram o template no signup.
update public.categories set "group" = 'necessidades'
  where name in ('Casa', 'Transporte', 'Alimentação', 'Saúde', 'Crianças')
  and kind = 'despesa'
  and "group" is null;

update public.categories set "group" = 'construcao'
  where kind = 'reserva'
  and "group" is null;

update public.categories set "group" = 'estilo'
  where name in ('Lazer', 'Gastos Pessoais', 'Férias/Viagens')
  and kind = 'despesa'
  and "group" is null;

update public.categories set "group" = 'livre'
  where name in ('Pet', 'Custos Financeiros')
  and kind = 'despesa'
  and "group" is null;

-- 4. Reescreve o seed pra popular grupos automaticamente em novas contas
create or replace function public.seed_default_categories(target_user uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  cat_id uuid;
begin
  -- Receitas
  insert into public.categories (user_id, name, kind, color, sort_order) values
    (target_user, 'Salário',         'receita', '#B99154', 1),
    (target_user, 'Rendimento',      'receita', '#B99154', 2),
    (target_user, 'Renda Extra',     'receita', '#B99154', 3),
    (target_user, 'Outros',          'receita', '#B99154', 4);

  -- Reservas — grupo Construção
  insert into public.categories (user_id, name, kind, color, sort_order, "group") values
    (target_user, 'Reserva de Emergência',    'reserva', '#0A2E20', 1, 'construcao'),
    (target_user, 'Independência Financeira', 'reserva', '#0A2E20', 2, 'construcao'),
    (target_user, 'Objetivos',                 'reserva', '#0A2E20', 3, 'construcao');

  -- Despesas — 10 grupos da planilha original, já classificados por grupo Valoria
  insert into public.categories (user_id, name, kind, color, sort_order, "group") values
    (target_user, 'Casa',               'despesa', '#0A2E20', 1,  'necessidades'),
    (target_user, 'Transporte',         'despesa', '#0A2E20', 2,  'necessidades'),
    (target_user, 'Alimentação',        'despesa', '#0A2E20', 3,  'necessidades'),
    (target_user, 'Crianças',           'despesa', '#9FA88A', 4,  'necessidades'),
    (target_user, 'Saúde',              'despesa', '#9FA88A', 5,  'necessidades'),
    (target_user, 'Lazer',              'despesa', '#B99154', 6,  'estilo'),
    (target_user, 'Gastos Pessoais',    'despesa', '#B99154', 7,  'estilo'),
    (target_user, 'Férias/Viagens',     'despesa', '#B99154', 8,  'estilo'),
    (target_user, 'Pet',                'despesa', '#B99154', 9,  'livre'),
    (target_user, 'Custos Financeiros', 'despesa', '#78716c', 10, 'livre');

  -- Subcategorias — Casa
  select id into cat_id from public.categories where user_id = target_user and name = 'Casa';
  insert into public.subcategories (category_id, user_id, name, sort_order) values
    (cat_id, target_user, 'Aluguel/Financiamento', 1),
    (cat_id, target_user, 'Energia', 2),
    (cat_id, target_user, 'Água', 3),
    (cat_id, target_user, 'Internet', 4),
    (cat_id, target_user, 'Condomínio', 5),
    (cat_id, target_user, 'Melhorias', 6);

  -- Subcategorias — Transporte
  select id into cat_id from public.categories where user_id = target_user and name = 'Transporte';
  insert into public.subcategories (category_id, user_id, name, sort_order) values
    (cat_id, target_user, 'Combustível', 1),
    (cat_id, target_user, 'Manutenção', 2),
    (cat_id, target_user, 'Seguro', 3),
    (cat_id, target_user, 'IPVA', 4),
    (cat_id, target_user, 'Estacionamento', 5);

  -- Subcategorias — Alimentação
  select id into cat_id from public.categories where user_id = target_user and name = 'Alimentação';
  insert into public.subcategories (category_id, user_id, name, sort_order) values
    (cat_id, target_user, 'Supermercado', 1),
    (cat_id, target_user, 'Restaurantes', 2),
    (cat_id, target_user, 'Delivery', 3),
    (cat_id, target_user, 'Padaria', 4);

  update public.profiles set onboarded_at = now() where id = target_user;
end;
$$;

-- 5. View auxiliar: distribuição NCE do mês
create or replace view public.nce_distribution
with (security_invoker = true)
as
select
  t.user_id,
  date_trunc('month', t.occurred_on)::date as month,
  c."group" as group_name,
  sum(t.amount) as total,
  count(*) as transactions_count
from public.transactions t
join public.categories c on c.id = t.category_id
where t.kind = 'despesa' or t.kind = 'reserva'
group by t.user_id, date_trunc('month', t.occurred_on), c."group";
