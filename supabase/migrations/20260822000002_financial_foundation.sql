-- ============================================================================
-- Norte / Valoria — Parte 1: fundação financeira
-- Saldo mensal, template completo da planilha e aportes vinculados às metas.
-- Migration incremental: preserva usuários, lançamentos e metas existentes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Saldo inicial mensal
-- Um saldo informado manualmente vira uma "âncora". Meses seguintes herdam o
-- saldo final automaticamente enquanto não houver outra âncora manual.
-- ----------------------------------------------------------------------------
create table if not exists public.monthly_balances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  year int not null check (year between 2020 and 2100),
  month int not null check (month between 1 and 12),
  opening_balance numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, year, month)
);

create index if not exists idx_monthly_balances_user_period
  on public.monthly_balances(user_id, year, month);

alter table public.monthly_balances enable row level security;

drop policy if exists "monthly_balances: dono tudo" on public.monthly_balances;
create policy "monthly_balances: dono tudo" on public.monthly_balances
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists trg_monthly_balances_updated on public.monthly_balances;
create trigger trg_monthly_balances_updated
before update on public.monthly_balances
for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 2) Metas: preserva o saldo atual como saldo-base e liga aportes às metas.
-- ----------------------------------------------------------------------------
alter table public.reserves
  add column if not exists starting_amount numeric(14, 2) not null default 0
  check (starting_amount >= 0);

-- Na primeira aplicação, o valor já acumulado vira o saldo-base da meta.
update public.reserves
set starting_amount = current_amount
where starting_amount = 0 and current_amount > 0;

alter table public.transactions
  add column if not exists reserve_id uuid references public.reserves(id) on delete set null;

create index if not exists idx_transactions_reserve
  on public.transactions(reserve_id)
  where reserve_id is not null;

-- Valida categoria/subcategoria e, agora, também o destino do aporte.
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

  if new.reserve_id is not null then
    if new.kind <> 'reserva' then
      raise exception 'Somente aportes podem ser vinculados a uma meta' using errcode = '23514';
    end if;

    if not exists (
      select 1
      from public.reserves r
      where r.id = new.reserve_id
        and r.user_id = new.user_id
        and r.archived = false
    ) then
      raise exception 'Meta inválida para este usuário' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_transaction_relations on public.transactions;
create trigger trg_validate_transaction_relations
before insert or update of user_id, kind, category_id, subcategory_id, reserve_id
on public.transactions
for each row execute function public.validate_transaction_relations();

-- Recalcula o progresso da meta a partir do saldo-base + aportes vinculados.
create or replace function public.sync_reserve_current_amount(target_reserve uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_reserve is null then
    return;
  end if;

  update public.reserves r
  set current_amount = r.starting_amount + coalesce((
    select sum(t.amount)
    from public.transactions t
    where t.reserve_id = r.id
      and t.kind = 'reserva'
  ), 0)
  where r.id = target_reserve;
end;
$$;

revoke all on function public.sync_reserve_current_amount(uuid) from public;
revoke all on function public.sync_reserve_current_amount(uuid) from anon;
revoke all on function public.sync_reserve_current_amount(uuid) from authenticated;

create or replace function public.sync_reserve_from_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_reserve_current_amount(old.reserve_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.reserve_id is distinct from new.reserve_id then
    perform public.sync_reserve_current_amount(old.reserve_id);
  end if;

  perform public.sync_reserve_current_amount(new.reserve_id);
  return new;
end;
$$;

revoke all on function public.sync_reserve_from_transaction() from public;
revoke all on function public.sync_reserve_from_transaction() from anon;
revoke all on function public.sync_reserve_from_transaction() from authenticated;

drop trigger if exists trg_sync_reserve_from_transaction on public.transactions;
create trigger trg_sync_reserve_from_transaction
after insert or update of amount, kind, reserve_id or delete
on public.transactions
for each row execute function public.sync_reserve_from_transaction();

-- Se o saldo-base for ajustado, recalcula o total exibido da meta.
create or replace function public.sync_reserve_from_starting_amount()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.current_amount := new.starting_amount + coalesce((
    select sum(t.amount)
    from public.transactions t
    where t.reserve_id = new.id
      and t.kind = 'reserva'
  ), 0);
  return new;
end;
$$;

drop trigger if exists trg_sync_reserve_from_starting_amount on public.reserves;
create trigger trg_sync_reserve_from_starting_amount
before insert or update of starting_amount
on public.reserves
for each row execute function public.sync_reserve_from_starting_amount();

-- ----------------------------------------------------------------------------
-- 3) Resumo financeiro mensal com saldo inicial e saldo final automático.
-- ----------------------------------------------------------------------------
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
  with params as (
    select
      make_date(target_year, target_month, 1) as month_start,
      (make_date(target_year, target_month, 1) + interval '1 month')::date as next_month
  ),
  anchor as (
    select
      make_date(mb.year, mb.month, 1) as anchor_month,
      mb.opening_balance
    from public.monthly_balances mb
    cross join params p
    where mb.user_id = auth.uid()
      and make_date(mb.year, mb.month, 1) <= p.month_start
    order by mb.year desc, mb.month desc
    limit 1
  ),
  opening_calc as (
    select
      case
        when exists (select 1 from anchor) then
          (select a.opening_balance from anchor a)
          + coalesce((
              select sum(
                case t.kind
                  when 'receita' then t.amount
                  when 'despesa' then -t.amount
                  when 'reserva' then -t.amount
                end
              )
              from public.transactions t
              cross join params p
              where t.user_id = auth.uid()
                and t.occurred_on >= (select a.anchor_month from anchor a)
                and t.occurred_on < p.month_start
            ), 0)
        else
          coalesce((
            select sum(
              case t.kind
                when 'receita' then t.amount
                when 'despesa' then -t.amount
                when 'reserva' then -t.amount
              end
            )
            from public.transactions t
            cross join params p
            where t.user_id = auth.uid()
              and t.occurred_on < p.month_start
          ), 0)
      end as opening_balance
  ),
  month_totals as (
    select
      coalesce(sum(t.amount) filter (where t.kind = 'receita'), 0) as receita,
      coalesce(sum(t.amount) filter (where t.kind = 'despesa'), 0) as despesa,
      coalesce(sum(t.amount) filter (where t.kind = 'reserva'), 0) as aportes,
      count(t.id) as tx_count
    from params p
    left join public.transactions t
      on t.user_id = auth.uid()
      and t.occurred_on >= p.month_start
      and t.occurred_on < p.next_month
  )
  select
    p.month_start,
    o.opening_balance,
    m.receita,
    m.despesa,
    m.receita - m.despesa,
    m.aportes,
    o.opening_balance + m.receita - m.despesa,
    o.opening_balance + m.receita - m.despesa - m.aportes,
    m.tx_count
  from params p
  cross join opening_calc o
  cross join month_totals m;
$$;

revoke all on function public.get_monthly_financial_summary(int, int) from public;
revoke all on function public.get_monthly_financial_summary(int, int) from anon;
grant execute on function public.get_monthly_financial_summary(int, int) to authenticated;

-- Mantém a view existente para compatibilidade e acrescenta resultado operacional.
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
  count(*) as transactions_count,
  coalesce(sum(amount) filter (where kind = 'receita'), 0)
    - coalesce(sum(amount) filter (where kind = 'despesa'), 0) as resultado_operacional
from public.transactions
group by user_id, date_trunc('month', occurred_on), year, month_num;

-- ----------------------------------------------------------------------------
-- 4) Template financeiro completo baseado na planilha enviada.
-- Itens pessoais da planilha ("empresa", confraternização etc.) não viram padrão.
-- ----------------------------------------------------------------------------
create or replace function public.apply_financial_template(target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cat_id uuid;
begin
  -- Normaliza alguns nomes do template antigo sem quebrar referências.
  update public.categories c
  set name = 'Rendimento de Juros', sort_order = 2
  where c.user_id = target_user and c.kind = 'receita' and c.name = 'Rendimento'
    and not exists (
      select 1 from public.categories x
      where x.user_id = target_user and x.kind = 'receita' and x.name = 'Rendimento de Juros'
    );

  update public.categories c
  set name = 'Diversos', sort_order = 7
  where c.user_id = target_user and c.kind = 'receita' and c.name = 'Outros'
    and not exists (
      select 1 from public.categories x
      where x.user_id = target_user and x.kind = 'receita' and x.name = 'Diversos'
    );

  update public.categories c
  set name = 'Outros Objetivos', sort_order = 6, "group" = 'construcao'
  where c.user_id = target_user and c.kind = 'reserva' and c.name = 'Objetivos'
    and not exists (
      select 1 from public.categories x
      where x.user_id = target_user and x.kind = 'reserva' and x.name = 'Outros Objetivos'
    );

  -- Receitas da planilha.
  insert into public.categories (user_id, name, kind, color, sort_order) values
    (target_user, 'Salário',              'receita', '#B99154', 1),
    (target_user, 'Rendimento de Juros',  'receita', '#B99154', 2),
    (target_user, 'Dividendos',            'receita', '#B99154', 3),
    (target_user, 'Reembolsos',            'receita', '#B99154', 4),
    (target_user, 'Renda Extra',           'receita', '#B99154', 5),
    (target_user, 'Pensão',                'receita', '#B99154', 6),
    (target_user, 'Diversos',              'receita', '#B99154', 7)
  on conflict (user_id, name, kind) do update
    set sort_order = excluded.sort_order;

  -- Construção / aportes.
  insert into public.categories (user_id, name, kind, color, sort_order, "group") values
    (target_user, 'Reserva de Emergência',    'reserva', '#0A2E20', 1, 'construcao'),
    (target_user, 'Independência Financeira', 'reserva', '#0A2E20', 2, 'construcao'),
    (target_user, 'Investimentos',             'reserva', '#0A2E20', 3, 'construcao'),
    (target_user, 'Reforma da Casa',           'reserva', '#0A2E20', 4, 'construcao'),
    (target_user, 'Quitação de Dívidas',       'reserva', '#0A2E20', 5, 'construcao'),
    (target_user, 'Outros Objetivos',          'reserva', '#0A2E20', 6, 'construcao')
  on conflict (user_id, name, kind) do update
    set sort_order = excluded.sort_order,
        "group" = excluded."group";

  -- Grandes grupos de despesas.
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
    (target_user, 'Custos Financeiros', 'despesa', '#78716c', 10, 'livre')
  on conflict (user_id, name, kind) do update
    set sort_order = excluded.sort_order,
        "group" = excluded."group";

  -- Casa
  select id into cat_id from public.categories
  where user_id = target_user and name = 'Casa' and kind = 'despesa';

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
  where user_id = target_user and name = 'Transporte' and kind = 'despesa';

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
  where user_id = target_user and name = 'Alimentação' and kind = 'despesa';

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
  where user_id = target_user and name = 'Crianças' and kind = 'despesa';
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
  where user_id = target_user and name = 'Lazer' and kind = 'despesa';
  insert into public.subcategories (category_id, user_id, name, sort_order) values
    (cat_id, target_user, 'Cinema/Streaming', 1),
    (cat_id, target_user, 'Shows', 2),
    (cat_id, target_user, 'Esportes', 3),
    (cat_id, target_user, 'Outras Atividades', 4),
    (cat_id, target_user, 'Aplicativos', 5)
  on conflict (category_id, name) do update set sort_order = excluded.sort_order;

  -- Saúde
  select id into cat_id from public.categories
  where user_id = target_user and name = 'Saúde' and kind = 'despesa';
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
  where user_id = target_user and name = 'Gastos Pessoais' and kind = 'despesa';
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
  where user_id = target_user and name = 'Férias/Viagens' and kind = 'despesa';
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
  where user_id = target_user and name = 'Pet' and kind = 'despesa';
  insert into public.subcategories (category_id, user_id, name, sort_order) values
    (cat_id, target_user, 'Veterinário', 1),
    (cat_id, target_user, 'Remédios', 2),
    (cat_id, target_user, 'Banho e Tosa', 3),
    (cat_id, target_user, 'Hospedagens', 4),
    (cat_id, target_user, 'Outros', 5)
  on conflict (category_id, name) do update set sort_order = excluded.sort_order;

  -- Custos financeiros
  select id into cat_id from public.categories
  where user_id = target_user and name = 'Custos Financeiros' and kind = 'despesa';
  insert into public.subcategories (category_id, user_id, name, sort_order) values
    (cat_id, target_user, 'Tarifas de Cartão', 1),
    (cat_id, target_user, 'Juros', 2),
    (cat_id, target_user, 'Multas por atraso', 3),
    (cat_id, target_user, 'Parcelas de Empréstimos', 4),
    (cat_id, target_user, 'Outros', 5)
  on conflict (category_id, name) do update set sort_order = excluded.sort_order;
end;
$$;

revoke all on function public.apply_financial_template(uuid) from public;
revoke all on function public.apply_financial_template(uuid) from anon;
revoke all on function public.apply_financial_template(uuid) from authenticated;

-- Wrapper público seguro usado pelo signup.
create or replace function public.seed_default_categories(target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or auth.uid() is distinct from target_user then
    raise exception 'Não autorizado' using errcode = '42501';
  end if;

  perform public.apply_financial_template(target_user);

  update public.profiles
  set onboarded_at = coalesce(onboarded_at, now())
  where id = target_user;
end;
$$;

revoke all on function public.seed_default_categories(uuid) from public;
revoke all on function public.seed_default_categories(uuid) from anon;
grant execute on function public.seed_default_categories(uuid) to authenticated;

-- Expande o template somente para usuários que já haviam escolhido o template.
do $$
declare
  profile_row record;
begin
  for profile_row in
    select id from public.profiles where onboarded_at is not null
  loop
    perform public.apply_financial_template(profile_row.id);
  end loop;
end;
$$;
