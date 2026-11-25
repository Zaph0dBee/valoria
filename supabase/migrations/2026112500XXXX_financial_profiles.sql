-- ============================================================================
-- Valoria — PF + PJ, fase 1: perfis financeiros
-- Spec: docs/superpowers/specs/2026-11-25-pf-pj-perfis-design.md
--
-- Cada usuário passa a ter um perfil PF (e, nas próximas fases, perfis PJ).
-- Todos os dados existentes são ligados ao PF. O app atual não envia
-- profile_id: triggers preenchem o PF automaticamente, então nada muda para
-- quem usa o sistema.
-- ============================================================================

-- 1) Tipo e tabela de perfis ---------------------------------------------------
do $$ begin
  create type public.profile_kind as enum ('pf', 'pj');
exception when duplicate_object then null;
end $$;

create table if not exists public.financial_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind public.profile_kind not null,
  name text not null check (length(trim(name)) > 0),
  document text check (document is null or document ~ '^([0-9]{11}|[0-9]{14})$'),
  color text not null default '#B99154',
  archived boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.financial_profiles is
  'Perfis financeiros do usuário: exatamente um PF (pessoa) e zero ou mais PJ (empresas).';
comment on column public.financial_profiles.document is
  'CPF (11) ou CNPJ (14), só dígitos. Opcional.';

create unique index if not exists uq_financial_profiles_one_pf
  on public.financial_profiles(user_id) where kind = 'pf';
create index if not exists idx_financial_profiles_user
  on public.financial_profiles(user_id) where not archived;

alter table public.financial_profiles enable row level security;

drop policy if exists "financial_profiles: dono tudo" on public.financial_profiles;
create policy "financial_profiles: dono tudo" on public.financial_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists trg_financial_profiles_updated on public.financial_profiles;
create trigger trg_financial_profiles_updated
before update on public.financial_profiles
for each row execute function public.set_updated_at();

-- 2) Funções auxiliares --------------------------------------------------------
create or replace function public.pf_profile_id(target_user uuid)
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  select fp.id from public.financial_profiles fp
  where fp.user_id = target_user and fp.kind = 'pf';
$$;

-- Cria o perfil PF de quem ainda não tem. Idempotente.
create or replace function public.ensure_pf_profiles()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.financial_profiles (user_id, kind, name)
  select
    u.id,
    'pf',
    coalesce(nullif(trim(p.full_name), ''), nullif(split_part(u.email, '@', 1), ''), 'Você')
  from auth.users u
  left join public.profiles p on p.id = u.id
  where not exists (
    select 1 from public.financial_profiles fp where fp.user_id = u.id and fp.kind = 'pf'
  )
  on conflict (user_id) where kind = 'pf' do nothing;
end;
$$;

revoke execute on function public.ensure_pf_profiles() from public, anon, authenticated;

select public.ensure_pf_profiles();

-- 3) profile_id nas tabelas de dados + backfill --------------------------------
alter table public.transactions
  add column if not exists profile_id uuid references public.financial_profiles(id) on delete restrict;
alter table public.categories
  add column if not exists profile_id uuid references public.financial_profiles(id) on delete restrict;
alter table public.monthly_balances
  add column if not exists profile_id uuid references public.financial_profiles(id) on delete restrict;
alter table public.imports
  add column if not exists profile_id uuid references public.financial_profiles(id) on delete restrict;
alter table public.budgets
  add column if not exists profile_id uuid references public.financial_profiles(id) on delete restrict;
alter table public.recurring_transactions
  add column if not exists profile_id uuid references public.financial_profiles(id) on delete restrict;

-- O backfill só preenche profile_id: desliga os triggers de updated_at para
-- não alterar a data de "última modificação" dos dados dos usuários.
alter table public.transactions disable trigger trg_transactions_updated;
alter table public.monthly_balances disable trigger trg_monthly_balances_updated;
alter table public.budgets disable trigger trg_budgets_updated;
alter table public.recurring_transactions disable trigger trg_recurring_transactions_updated;

update public.transactions set profile_id = public.pf_profile_id(user_id) where profile_id is null;
update public.categories set profile_id = public.pf_profile_id(user_id) where profile_id is null;
update public.monthly_balances set profile_id = public.pf_profile_id(user_id) where profile_id is null;
update public.imports set profile_id = public.pf_profile_id(user_id) where profile_id is null;
update public.budgets set profile_id = public.pf_profile_id(user_id) where profile_id is null;
update public.recurring_transactions set profile_id = public.pf_profile_id(user_id) where profile_id is null;

alter table public.transactions enable trigger trg_transactions_updated;
alter table public.monthly_balances enable trigger trg_monthly_balances_updated;
alter table public.budgets enable trigger trg_budgets_updated;
alter table public.recurring_transactions enable trigger trg_recurring_transactions_updated;

alter table public.transactions alter column profile_id set not null;
alter table public.categories alter column profile_id set not null;
alter table public.monthly_balances alter column profile_id set not null;
alter table public.imports alter column profile_id set not null;
alter table public.budgets alter column profile_id set not null;
alter table public.recurring_transactions alter column profile_id set not null;

create index if not exists idx_transactions_profile_date on public.transactions(profile_id, occurred_on desc);
create index if not exists idx_categories_profile on public.categories(profile_id);
create index if not exists idx_monthly_balances_profile on public.monthly_balances(profile_id);
create index if not exists idx_imports_profile on public.imports(profile_id);
create index if not exists idx_budgets_profile on public.budgets(profile_id);
create index if not exists idx_recurring_transactions_profile on public.recurring_transactions(profile_id);

-- 4) Preenchimento automático do perfil ----------------------------------------
-- O app atual não envia profile_id. Usa o perfil da categoria quando houver;
-- senão, o PF do usuário. Nome com "00" para rodar antes das validações
-- (triggers BEFORE executam em ordem alfabética).
create or replace function public.fill_default_profile()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_category uuid;
begin
  if new.profile_id is not null then
    return new;
  end if;

  if tg_table_name in ('transactions', 'budgets', 'recurring_transactions') then
    v_category := (to_jsonb(new) ->> 'category_id')::uuid;
    if v_category is not null then
      select c.profile_id into new.profile_id
      from public.categories c
      where c.id = v_category and c.user_id = new.user_id;
    end if;
  end if;

  if new.profile_id is null then
    new.profile_id := public.pf_profile_id(new.user_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_00_fill_default_profile on public.transactions;
create trigger trg_00_fill_default_profile before insert on public.transactions
  for each row execute function public.fill_default_profile();
drop trigger if exists trg_00_fill_default_profile on public.categories;
create trigger trg_00_fill_default_profile before insert on public.categories
  for each row execute function public.fill_default_profile();
drop trigger if exists trg_00_fill_default_profile on public.monthly_balances;
create trigger trg_00_fill_default_profile before insert on public.monthly_balances
  for each row execute function public.fill_default_profile();
drop trigger if exists trg_00_fill_default_profile on public.imports;
create trigger trg_00_fill_default_profile before insert on public.imports
  for each row execute function public.fill_default_profile();
drop trigger if exists trg_00_fill_default_profile on public.budgets;
create trigger trg_00_fill_default_profile before insert on public.budgets
  for each row execute function public.fill_default_profile();
drop trigger if exists trg_00_fill_default_profile on public.recurring_transactions;
create trigger trg_00_fill_default_profile before insert on public.recurring_transactions
  for each row execute function public.fill_default_profile();
