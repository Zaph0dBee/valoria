-- ============================================================================
-- Norte — Schema inicial
-- Controle financeiro pessoal multi-usuário com categorias customizáveis
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
create type transaction_kind as enum ('receita', 'despesa', 'reserva');
create type import_source as enum ('manual', 'csv', 'ofx');
create type import_status as enum ('pending', 'processed', 'failed');

-- ----------------------------------------------------------------------------
-- profiles: extensão de auth.users
-- ----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  currency text not null default 'BRL',
  timezone text not null default 'America/Sao_Paulo',
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Cria profile automaticamente ao criar auth user
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- categories: grupos customizáveis pelo usuário
-- ----------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind transaction_kind not null,
  color text not null default '#1e3a5f',
  icon text,
  sort_order int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, name, kind)
);

create index idx_categories_user on public.categories(user_id) where not archived;

-- ----------------------------------------------------------------------------
-- subcategories
-- ----------------------------------------------------------------------------
create table public.subcategories (
  id uuid primary key default uuid_generate_v4(),
  category_id uuid not null references public.categories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (category_id, name)
);

create index idx_subcategories_cat on public.subcategories(category_id) where not archived;
create index idx_subcategories_user on public.subcategories(user_id);

-- ----------------------------------------------------------------------------
-- transactions: lançamentos individuais
-- ----------------------------------------------------------------------------
create table public.transactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  occurred_on date not null,
  amount numeric(14, 2) not null check (amount >= 0),
  kind transaction_kind not null,
  category_id uuid references public.categories(id) on delete set null,
  subcategory_id uuid references public.subcategories(id) on delete set null,
  description text not null,
  notes text,
  source import_source not null default 'manual',
  import_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_transactions_user_date on public.transactions(user_id, occurred_on desc);
create index idx_transactions_user_kind on public.transactions(user_id, kind, occurred_on desc);
create index idx_transactions_category on public.transactions(category_id) where category_id is not null;

-- ----------------------------------------------------------------------------
-- budgets: orçamento mensal por categoria
-- ----------------------------------------------------------------------------
create table public.budgets (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  year int not null check (year between 2020 and 2100),
  month int not null check (month between 1 and 12),
  planned_amount numeric(14, 2) not null check (planned_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_id, year, month)
);

create index idx_budgets_user_period on public.budgets(user_id, year, month);

-- ----------------------------------------------------------------------------
-- reserves: metas de reserva/investimento
-- ----------------------------------------------------------------------------
create table public.reserves (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric(14, 2) not null check (target_amount > 0),
  current_amount numeric(14, 2) not null default 0 check (current_amount >= 0),
  target_date date,
  color text not null default '#1e3a5f',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_reserves_user on public.reserves(user_id) where not archived;

-- ----------------------------------------------------------------------------
-- imports: histórico de imports CSV/OFX
-- ----------------------------------------------------------------------------
create table public.imports (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source import_source not null,
  filename text,
  status import_status not null default 'pending',
  transactions_count int not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index idx_imports_user on public.imports(user_id, created_at desc);

alter table public.transactions
  add constraint fk_import foreign key (import_id) references public.imports(id) on delete set null;

-- ----------------------------------------------------------------------------
-- updated_at trigger
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger trg_transactions_updated before update on public.transactions
  for each row execute function public.set_updated_at();
create trigger trg_budgets_updated before update on public.budgets
  for each row execute function public.set_updated_at();
create trigger trg_reserves_updated before update on public.reserves
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Row Level Security — cada usuário só vê seus dados
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.subcategories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.reserves enable row level security;
alter table public.imports enable row level security;

create policy "profiles: dono lê" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles: dono atualiza" on public.profiles
  for update using (auth.uid() = id);

create policy "categories: dono tudo" on public.categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "subcategories: dono tudo" on public.subcategories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "transactions: dono tudo" on public.transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "budgets: dono tudo" on public.budgets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "reserves: dono tudo" on public.reserves
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "imports: dono tudo" on public.imports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================================
-- Views auxiliares
-- ============================================================================

-- Resumo mensal por usuário (agregações que o dashboard usa muito)
create or replace view public.monthly_summary
with (security_invoker = true)
as
select
  user_id,
  date_trunc('month', occurred_on)::date as month,
  extract(year from occurred_on)::int as year,
  extract(month from occurred_on)::int as month_num,
  sum(amount) filter (where kind = 'receita') as total_receita,
  sum(amount) filter (where kind = 'despesa') as total_despesa,
  sum(amount) filter (where kind = 'reserva') as total_reserva,
  sum(amount) filter (where kind = 'receita')
    - sum(amount) filter (where kind = 'despesa')
    - sum(amount) filter (where kind = 'reserva') as resultado_liquido,
  count(*) as transactions_count
from public.transactions
group by user_id, date_trunc('month', occurred_on), year, month_num;

-- Breakdown por categoria no mês
create or replace view public.category_breakdown
with (security_invoker = true)
as
select
  t.user_id,
  date_trunc('month', t.occurred_on)::date as month,
  c.id as category_id,
  c.name as category_name,
  c.color as category_color,
  c.kind,
  sum(t.amount) as total,
  count(*) as transactions_count
from public.transactions t
left join public.categories c on c.id = t.category_id
group by t.user_id, date_trunc('month', t.occurred_on), c.id, c.name, c.color, c.kind;

-- ============================================================================
-- Seed: função opcional que popula categorias padrão da planilha original
-- Chamar após criar conta se o usuário quiser começar com o template.
-- ============================================================================
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
    (target_user, 'Salário',         'receita', '#0f766e', 1),
    (target_user, 'Rendimento',      'receita', '#0f766e', 2),
    (target_user, 'Renda Extra',     'receita', '#0f766e', 3),
    (target_user, 'Outros',          'receita', '#0f766e', 4);

  -- Reservas
  insert into public.categories (user_id, name, kind, color, sort_order) values
    (target_user, 'Reserva de Emergência',   'reserva', '#1e3a5f', 1),
    (target_user, 'Independência Financeira','reserva', '#1e3a5f', 2),
    (target_user, 'Objetivos',                'reserva', '#1e3a5f', 3);

  -- Despesas — 10 grupos da planilha original
  insert into public.categories (user_id, name, kind, color, sort_order) values
    (target_user, 'Casa',               'despesa', '#b45309', 1),
    (target_user, 'Transporte',         'despesa', '#7c2d12', 2),
    (target_user, 'Alimentação',        'despesa', '#a16207', 3),
    (target_user, 'Crianças',           'despesa', '#9333ea', 4),
    (target_user, 'Lazer',              'despesa', '#0369a1', 5),
    (target_user, 'Saúde',              'despesa', '#be123c', 6),
    (target_user, 'Gastos Pessoais',    'despesa', '#4338ca', 7),
    (target_user, 'Férias/Viagens',     'despesa', '#0891b2', 8),
    (target_user, 'Pet',                'despesa', '#65a30d', 9),
    (target_user, 'Custos Financeiros', 'despesa', '#78716c', 10);

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

  -- Marca profile como onboarded
  update public.profiles set onboarded_at = now() where id = target_user;
end;
$$;
