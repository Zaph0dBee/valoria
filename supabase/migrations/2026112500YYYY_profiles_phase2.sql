-- ============================================================================
-- Valoria — PF + PJ, fase 2: dados por perfil (empresas)
-- Spec: docs/superpowers/specs/2026-11-25-pf-pj-perfis-design.md
-- Plano: docs/superpowers/plans/2026-11-25-pf-pj-fase2-empresas-seletor.md
--
-- Compatível com o app publicado antes da fase 2: nenhuma chave usada por ele
-- é removida (a antiga de monthly_balances só sai depois do deploy novo) e as
-- views só ganham uma coluna no final.
-- ============================================================================

-- 1) Categorias: nome único por perfil (empresa pode ter "Aluguel" como a PF) --
alter table public.categories drop constraint if exists categories_user_id_name_kind_key;
alter table public.categories drop constraint if exists categories_profile_id_name_kind_key;
alter table public.categories
  add constraint categories_profile_id_name_kind_key unique (profile_id, name, kind);

-- O template da PF usava a chave antiga no ON CONFLICT. Recria a função a
-- partir da definição atual trocando só a chave (3 ocorrências).
do $$
declare
  v_def text := pg_get_functiondef('public.apply_financial_template(uuid)'::regprocedure);
  v_old constant text := 'on conflict (user_id, name, kind)';
  v_new constant text := 'on conflict (profile_id, name, kind)';
  v_count int;
begin
  v_count := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_count <> 3 then
    raise exception 'apply_financial_template: esperava 3 ocorrências da chave antiga, achei %', v_count;
  end if;
  execute replace(v_def, v_old, v_new);
end $$;

-- 2) Saldo inicial por perfil -------------------------------------------------
-- A chave nova entra agora; a antiga (user_id, year, month) sai na migration
-- seguinte, depois que o app que faz upsert por profile_id estiver no ar.
alter table public.monthly_balances drop constraint if exists monthly_balances_profile_id_year_month_key;
alter table public.monthly_balances
  add constraint monthly_balances_profile_id_year_month_key unique (profile_id, year, month);

-- 3) Views do painel com profile_id (coluna nova no final) --------------------
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
  count(*) as transactions_count,
  t.profile_id
from public.transactions t
left join public.categories c on c.id = t.category_id
left join public.subcategories s on s.id = t.subcategory_id
where t.kind = 'despesa' or t.kind = 'reserva'
group by
  t.user_id,
  t.profile_id,
  date_trunc('month', t.occurred_on),
  coalesce(
    s.group_override,
    c."group",
    case when t.kind = 'reserva' then 'construcao'::public.category_group end
  );

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
  count(*) as transactions_count,
  t.profile_id
from public.transactions t
left join public.categories c on c.id = t.category_id
group by t.user_id, t.profile_id, date_trunc('month', t.occurred_on), c.id, c.name, c.color, t.kind;

-- 4) Template de categorias de empresa ----------------------------------------
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

  insert into public.categories (user_id, profile_id, name, kind, color, sort_order) values
    (v_user, target_profile, 'Vendas',                 'receita', '#B99154', 1),
    (v_user, target_profile, 'Prestação de serviços',  'receita', '#B99154', 2),
    (v_user, target_profile, 'Outras receitas',        'receita', '#B99154', 3),
    (v_user, target_profile, 'Impostos (DAS/Simples)', 'despesa', '#9FA88A', 1),
    (v_user, target_profile, 'Fornecedores e insumos', 'despesa', '#9FA88A', 2),
    (v_user, target_profile, 'Folha e encargos',       'despesa', '#9FA88A', 3),
    (v_user, target_profile, 'Aluguel e estrutura',    'despesa', '#9FA88A', 4),
    (v_user, target_profile, 'Software e ferramentas', 'despesa', '#9FA88A', 5),
    (v_user, target_profile, 'Marketing',              'despesa', '#9FA88A', 6),
    (v_user, target_profile, 'Tarifas bancárias',      'despesa', '#9FA88A', 7),
    (v_user, target_profile, 'Contabilidade',          'despesa', '#9FA88A', 8),
    (v_user, target_profile, 'Outros',                 'despesa', '#78716c', 9)
  on conflict (profile_id, name, kind) do nothing;
end;
$$;

revoke execute on function public.apply_pj_template(uuid) from public, anon;
grant execute on function public.apply_pj_template(uuid) to authenticated;

-- 5) Integridade: empresa não faz aporte (reserva) ----------------------------
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
begin
  select fp.user_id, fp.archived, fp.kind into v_owner, v_archived, v_profile_kind
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

  return new;
end;
$$;

-- 6) Excluir empresa criada por engano (só sem lançamentos) -------------------
create or replace function public.delete_company(target_profile uuid)
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

  if exists (select 1 from public.transactions t where t.profile_id = target_profile) then
    raise exception 'Esta empresa tem lançamentos. Arquive em vez de excluir.' using errcode = '23514';
  end if;

  delete from public.budgets where profile_id = target_profile;
  delete from public.recurring_transactions where profile_id = target_profile;
  delete from public.monthly_balances where profile_id = target_profile;
  delete from public.imports where profile_id = target_profile;
  delete from public.categories where profile_id = target_profile;
  delete from public.financial_profiles where id = target_profile;
end;
$$;

revoke execute on function public.delete_company(uuid) from public, anon;
grant execute on function public.delete_company(uuid) to authenticated;

-- 7) Nome do PF: contas antigas ficaram com o e-mail completo como nome -------
update public.financial_profiles fp
set name = coalesce(nullif(split_part(u.email, '@', 1), ''), 'Você')
from auth.users u
where fp.user_id = u.id
  and fp.kind = 'pf'
  and fp.name = u.email;

-- 8) pf_profile_id não precisa ser chamável sem login -------------------------
revoke execute on function public.pf_profile_id(uuid) from public, anon;
grant execute on function public.pf_profile_id(uuid) to authenticated;
