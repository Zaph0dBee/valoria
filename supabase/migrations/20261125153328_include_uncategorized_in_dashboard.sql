-- Distribuição Valoria/NCE: não descartar lançamentos sem categoria.
--
-- Antes, a view usava INNER JOIN com categories, então aportes vinculados
-- a uma meta (que normalmente não têm categoria) e despesas "Sem categoria"
-- sumiam do painel "Meu dinheiro está indo para onde eu quero?".
--
-- Agora:
-- - aporte (kind = 'reserva') sem grupo definido conta como 'construcao';
-- - despesa sem categoria aparece com group_name = null ("sem classificação").

create or replace view public.nce_distribution
with (security_invoker = true)
as
select
  t.user_id,
  date_trunc('month', t.occurred_on)::date as month,
  coalesce(
    s.group_override,
    c."group",
    case when t.kind = 'reserva' then 'construcao'::public.category_group end
  ) as group_name,
  sum(t.amount) as total,
  count(*) as transactions_count
from public.transactions t
left join public.categories c on c.id = t.category_id
left join public.subcategories s on s.id = t.subcategory_id
where t.kind = 'despesa' or t.kind = 'reserva'
group by
  t.user_id,
  date_trunc('month', t.occurred_on),
  coalesce(
    s.group_override,
    c."group",
    case when t.kind = 'reserva' then 'construcao'::public.category_group end
  );

-- Despesas por categoria: agrupar pelo tipo do LANÇAMENTO, não da categoria.
--
-- Antes, lançamentos sem categoria ficavam com kind = null (c.kind) e
-- receitas, despesas e aportes sem categoria eram somados juntos num grupo
-- que o painel descartava. Resultado: despesas importadas sem categoria não
-- apareciam em "Despesas por categoria".
create or replace view public.category_breakdown
with (security_invoker = true)
as
select
  t.user_id,
  date_trunc('month', t.occurred_on)::date as month,
  c.id as category_id,
  c.name as category_name,
  c.color as category_color,
  t.kind,
  sum(t.amount) as total,
  count(*) as transactions_count
from public.transactions t
left join public.categories c on c.id = t.category_id
group by t.user_id, date_trunc('month', t.occurred_on), c.id, c.name, c.color, t.kind;
