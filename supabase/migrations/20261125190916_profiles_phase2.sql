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

-- Template da PF reescrito por perfil: agora a empresa pode ter categorias com
-- o mesmo nome da PF, então cada busca, renomeação e inserção é restrita ao
-- perfil PF do usuário (antes filtrava só por user_id).
create or replace function public.apply_financial_template(target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cat_id uuid;
  v_pf uuid := public.ensure_pf_profile(target_user);
begin
  if v_pf is null then
    raise exception 'Perfil pessoal não encontrado' using errcode = '23514';
  end if;

  -- Normaliza alguns nomes do template antigo sem quebrar referências.
  update public.categories c
  set name = 'Rendimento de Juros', sort_order = 2
  where c.user_id = target_user and c.profile_id = v_pf and c.kind = 'receita' and c.name = 'Rendimento'
    and not exists (
      select 1 from public.categories x
      where x.user_id = target_user and x.profile_id = v_pf and x.kind = 'receita' and x.name = 'Rendimento de Juros'
    );

  update public.categories c
  set name = 'Diversos', sort_order = 7
  where c.user_id = target_user and c.profile_id = v_pf and c.kind = 'receita' and c.name = 'Outros'
    and not exists (
      select 1 from public.categories x
      where x.user_id = target_user and x.profile_id = v_pf and x.kind = 'receita' and x.name = 'Diversos'
    );

  update public.categories c
  set name = 'Outros Objetivos', sort_order = 6, "group" = 'construcao'
  where c.user_id = target_user and c.profile_id = v_pf and c.kind = 'reserva' and c.name = 'Objetivos'
    and not exists (
      select 1 from public.categories x
      where x.user_id = target_user and x.profile_id = v_pf and x.kind = 'reserva' and x.name = 'Outros Objetivos'
    );

  -- Receitas da planilha.
  insert into public.categories (user_id, profile_id, name, kind, color, sort_order) values
    (target_user, v_pf, 'Salário',              'receita', '#B99154', 1),
    (target_user, v_pf, 'Rendimento de Juros',  'receita', '#B99154', 2),
    (target_user, v_pf, 'Dividendos',            'receita', '#B99154', 3),
    (target_user, v_pf, 'Reembolsos',            'receita', '#B99154', 4),
    (target_user, v_pf, 'Renda Extra',           'receita', '#B99154', 5),
    (target_user, v_pf, 'Pensão',                'receita', '#B99154', 6),
    (target_user, v_pf, 'Diversos',              'receita', '#B99154', 7)
  on conflict (profile_id, name, kind) do update
    set sort_order = excluded.sort_order;

  -- Construção / aportes.
  insert into public.categories (user_id, profile_id, name, kind, color, sort_order, "group") values
    (target_user, v_pf, 'Reserva de Emergência',    'reserva', '#0A2E20', 1, 'construcao'),
    (target_user, v_pf, 'Independência Financeira', 'reserva', '#0A2E20', 2, 'construcao'),
    (target_user, v_pf, 'Investimentos',             'reserva', '#0A2E20', 3, 'construcao'),
    (target_user, v_pf, 'Reforma da Casa',           'reserva', '#0A2E20', 4, 'construcao'),
    (target_user, v_pf, 'Quitação de Dívidas',       'reserva', '#0A2E20', 5, 'construcao'),
    (target_user, v_pf, 'Outros Objetivos',          'reserva', '#0A2E20', 6, 'construcao')
  on conflict (profile_id, name, kind) do update
    set sort_order = excluded.sort_order,
        "group" = excluded."group";

  -- Grandes grupos de despesas.
  insert into public.categories (user_id, profile_id, name, kind, color, sort_order, "group") values
    (target_user, v_pf, 'Casa',               'despesa', '#0A2E20', 1,  'necessidades'),
    (target_user, v_pf, 'Transporte',         'despesa', '#0A2E20', 2,  'necessidades'),
    (target_user, v_pf, 'Alimentação',        'despesa', '#0A2E20', 3,  'necessidades'),
    (target_user, v_pf, 'Crianças',           'despesa', '#9FA88A', 4,  'necessidades'),
    (target_user, v_pf, 'Saúde',              'despesa', '#9FA88A', 5,  'necessidades'),
    (target_user, v_pf, 'Lazer',              'despesa', '#B99154', 6,  'estilo'),
    (target_user, v_pf, 'Gastos Pessoais',    'despesa', '#B99154', 7,  'estilo'),
    (target_user, v_pf, 'Férias/Viagens',     'despesa', '#B99154', 8,  'estilo'),
    (target_user, v_pf, 'Pet',                'despesa', '#B99154', 9,  'livre'),
    (target_user, v_pf, 'Custos Financeiros', 'despesa', '#78716c', 10, 'livre')
  on conflict (profile_id, name, kind) do update
    set sort_order = excluded.sort_order,
        "group" = excluded."group";

  -- Casa
  select id into cat_id from public.categories
  where user_id = target_user and profile_id = v_pf and name = 'Casa' and kind = 'despesa';

  update public.subcategories s set name = 'Energia elétrica'
  where s.category_id = cat_id and s.name = 'Energia'
    and not exists (select 1 from public.subcategories x where x.category_id = cat_id and x.name = 'Energia elétrica');

  insert into public.subcategories (category_id, user_id, name, sort_order) values
    (cat_id, target_user, 'Aluguel/Financiamento', 1),
    (cat_id, target_user, 'Seguro residencial', 2),
    (cat_id, target_user, 'Energia elétrica', 3),
    (cat_id, target_user, 'Água', 4),
    (cat_id, target_user, 'Telefone', 5),
    (cat_id, target_user, 'TV', 6),
    (cat_id, target_user, 'Internet', 7),
    (cat_id, target_user, 'Taxa de lixo', 8),
    (cat_id, target_user, 'Condomínio', 9),
    (cat_id, target_user, 'Utensílios', 10),
    (cat_id, target_user, 'Melhorias', 11),
    (cat_id, target_user, 'Outros', 12)
  on conflict (category_id, name) do update set sort_order = excluded.sort_order;

  -- Transporte
  select id into cat_id from public.categories
  where user_id = target_user and profile_id = v_pf and name = 'Transporte' and kind = 'despesa';

  update public.subcategories s set name = 'Reparos/Manutenção'
  where s.category_id = cat_id and s.name = 'Manutenção'
    and not exists (select 1 from public.subcategories x where x.category_id = cat_id and x.name = 'Reparos/Manutenção');
  update public.subcategories s set name = 'Seguro Automóvel'
  where s.category_id = cat_id and s.name = 'Seguro'
    and not exists (select 1 from public.subcategories x where x.category_id = cat_id and x.name = 'Seguro Automóvel');

  insert into public.subcategories (category_id, user_id, name, sort_order) values
    (cat_id, target_user, 'Parcelas do Carro', 1),
    (cat_id, target_user, 'Seguro Automóvel', 2),
    (cat_id, target_user, 'Combustível', 3),
    (cat_id, target_user, 'Transporte Público', 4),
    (cat_id, target_user, 'Pedágio', 5),
    (cat_id, target_user, 'Estacionamento', 6),
    (cat_id, target_user, 'Reparos/Manutenção', 7),
    (cat_id, target_user, 'IPVA', 8),
    (cat_id, target_user, 'Taxa de Habilitação', 9)
  on conflict (category_id, name) do update set sort_order = excluded.sort_order;

  -- Alimentação
  select id into cat_id from public.categories
  where user_id = target_user and profile_id = v_pf and name = 'Alimentação' and kind = 'despesa';

  update public.subcategories s set name = 'Pedidos APP/Delivery'
  where s.category_id = cat_id and s.name = 'Delivery'
    and not exists (select 1 from public.subcategories x where x.category_id = cat_id and x.name = 'Pedidos APP/Delivery');

  insert into public.subcategories (category_id, user_id, name, sort_order) values
    (cat_id, target_user, 'Supermercado', 1),
    (cat_id, target_user, 'Padaria', 2),
    (cat_id, target_user, 'Pedidos APP/Delivery', 3),
    (cat_id, target_user, 'Restaurantes', 4),
    (cat_id, target_user, 'Feira', 5),
    (cat_id, target_user, 'Outros', 6)
  on conflict (category_id, name) do update set sort_order = excluded.sort_order;

  -- Crianças
  select id into cat_id from public.categories
  where user_id = target_user and profile_id = v_pf and name = 'Crianças' and kind = 'despesa';
  insert into public.subcategories (category_id, user_id, name, sort_order) values
    (cat_id, target_user, 'Mensalidade Escolar', 1),
    (cat_id, target_user, 'Material Escolar', 2),
    (cat_id, target_user, 'Esportes', 3),
    (cat_id, target_user, 'Idiomas', 4),
    (cat_id, target_user, 'Lanches', 5),
    (cat_id, target_user, 'Festas', 6),
    (cat_id, target_user, 'Presentes', 7),
    (cat_id, target_user, 'Outros', 8)
  on conflict (category_id, name) do update set sort_order = excluded.sort_order;

  -- Lazer
  select id into cat_id from public.categories
  where user_id = target_user and profile_id = v_pf and name = 'Lazer' and kind = 'despesa';
  insert into public.subcategories (category_id, user_id, name, sort_order) values
    (cat_id, target_user, 'Cinema/Streaming', 1),
    (cat_id, target_user, 'Shows', 2),
    (cat_id, target_user, 'Esportes', 3),
    (cat_id, target_user, 'Outras Atividades', 4),
    (cat_id, target_user, 'Aplicativos', 5)
  on conflict (category_id, name) do update set sort_order = excluded.sort_order;

  -- Saúde
  select id into cat_id from public.categories
  where user_id = target_user and profile_id = v_pf and name = 'Saúde' and kind = 'despesa';
  insert into public.subcategories (category_id, user_id, name, sort_order) values
    (cat_id, target_user, 'Plano de Saúde', 1),
    (cat_id, target_user, 'Academia', 2),
    (cat_id, target_user, 'Médico/Dentista', 3),
    (cat_id, target_user, 'Remédios', 4),
    (cat_id, target_user, 'Consultas Particulares', 5),
    (cat_id, target_user, 'Seguro de Vida', 6),
    (cat_id, target_user, 'Exames', 7)
  on conflict (category_id, name) do update set sort_order = excluded.sort_order;

  -- Gastos pessoais
  select id into cat_id from public.categories
  where user_id = target_user and profile_id = v_pf and name = 'Gastos Pessoais' and kind = 'despesa';
  insert into public.subcategories (category_id, user_id, name, sort_order) values
    (cat_id, target_user, 'Roupas', 1),
    (cat_id, target_user, 'Sapatos', 2),
    (cat_id, target_user, 'Acessórios', 3),
    (cat_id, target_user, 'Estética', 4),
    (cat_id, target_user, 'Farmácia', 5),
    (cat_id, target_user, 'Educação', 6),
    (cat_id, target_user, 'Presentes', 7),
    (cat_id, target_user, 'Doação', 8),
    (cat_id, target_user, 'Livros', 9),
    (cat_id, target_user, 'Celular', 10)
  on conflict (category_id, name) do update set sort_order = excluded.sort_order;

  -- Férias / viagens
  select id into cat_id from public.categories
  where user_id = target_user and profile_id = v_pf and name = 'Férias/Viagens' and kind = 'despesa';
  insert into public.subcategories (category_id, user_id, name, sort_order) values
    (cat_id, target_user, 'Passagens', 1),
    (cat_id, target_user, 'Acomodações', 2),
    (cat_id, target_user, 'Alimentação', 3),
    (cat_id, target_user, 'Lembrancinhas', 4),
    (cat_id, target_user, 'Animais/Pet', 5),
    (cat_id, target_user, 'Aluguel de Carro', 6)
  on conflict (category_id, name) do update set sort_order = excluded.sort_order;

  -- Pet
  select id into cat_id from public.categories
  where user_id = target_user and profile_id = v_pf and name = 'Pet' and kind = 'despesa';
  insert into public.subcategories (category_id, user_id, name, sort_order) values
    (cat_id, target_user, 'Veterinário', 1),
    (cat_id, target_user, 'Remédios', 2),
    (cat_id, target_user, 'Banho e Tosa', 3),
    (cat_id, target_user, 'Hospedagens', 4),
    (cat_id, target_user, 'Outros', 5)
  on conflict (category_id, name) do update set sort_order = excluded.sort_order;

  -- Custos financeiros
  select id into cat_id from public.categories
  where user_id = target_user and profile_id = v_pf and name = 'Custos Financeiros' and kind = 'despesa';
  insert into public.subcategories (category_id, user_id, name, sort_order) values
    (cat_id, target_user, 'Tarifas de Cartão', 1),
    (cat_id, target_user, 'Juros', 2),
    (cat_id, target_user, 'Multas por atraso', 3),
    (cat_id, target_user, 'Parcelas de Empréstimos', 4),
    (cat_id, target_user, 'Outros', 5)
  on conflict (category_id, name) do update set sort_order = excluded.sort_order;
end;
$$;

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
