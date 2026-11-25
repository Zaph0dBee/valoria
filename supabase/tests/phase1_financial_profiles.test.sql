-- Testes da fase 1 de PF+PJ (perfis financeiros).
-- SEMPRE rodar dentro de `begin; ... rollback;` (ver scripts/db-dry-run.md).
-- Qualquer falha aparece como erro com o nome do teste.

-- t01_backfill: nenhum dado sem perfil e exatamente 1 PF por usuário
do $$ begin
  if exists (select 1 from public.transactions where profile_id is null)
     or exists (select 1 from public.categories where profile_id is null)
     or exists (select 1 from public.monthly_balances where profile_id is null)
     or exists (select 1 from public.imports where profile_id is null)
     or exists (select 1 from public.budgets where profile_id is null)
     or exists (select 1 from public.recurring_transactions where profile_id is null)
  then raise exception 't01_backfill: há linhas sem profile_id'; end if;
  if (select count(*) from auth.users u
      where (select count(*) from public.financial_profiles p where p.user_id = u.id and p.kind = 'pf') <> 1) > 0
  then raise exception 't01_backfill: usuário sem exatamente 1 perfil PF'; end if;
  if exists (select 1 from public.transactions t join public.financial_profiles p on p.id = t.profile_id
             where p.user_id <> t.user_id or p.kind <> 'pf')
  then raise exception 't01_backfill: lançamento ligado a perfil errado'; end if;
end $$;

-- t01_backfill_nome_fallback: nenhum perfil com nome vazio
do $$ begin
  if exists (select 1 from public.financial_profiles where trim(name) = '')
  then raise exception 't01_backfill_nome_fallback: perfil sem nome'; end if;
end $$;

-- Usuários sintéticos (signup dispara handle_new_user).
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pf-test-a@example.invalid', '{"full_name":"Ana Teste"}'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pf-test-b@example.invalid', '{}');
select public.ensure_pf_profiles(); -- temporário: removido na Task 2 (signup passa a criar o PF)

-- t03_default_fill_*: insert sem profile_id cai no PF do dono
do $$ declare v_cat uuid; v_tx uuid; begin
  insert into public.categories (user_id, name, kind)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'Teste Cat', 'despesa') returning id into v_cat;
  if (select profile_id from public.categories where id = v_cat)
     is distinct from public.pf_profile_id('aaaaaaaa-0000-0000-0000-000000000001')
  then raise exception 't03_default_fill_categoria'; end if;
  insert into public.transactions (user_id, occurred_on, amount, kind, description, category_id)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '2026-01-10', 10, 'despesa', 'x', v_cat) returning id into v_tx;
  if (select profile_id from public.transactions where id = v_tx)
     is distinct from public.pf_profile_id('aaaaaaaa-0000-0000-0000-000000000001')
  then raise exception 't03_default_fill_lancamento'; end if;
  insert into public.imports (user_id, source, filename) values ('aaaaaaaa-0000-0000-0000-000000000001', 'csv', 'x.csv');
  if exists (select 1 from public.imports where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and profile_id is null)
  then raise exception 't03_default_fill_import'; end if;
end $$;

-- t04_upsert_monthly_balance: o upsert do app (onConflict user_id,year,month) segue válido
insert into public.monthly_balances (user_id, year, month, opening_balance)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 2026, 1, 50)
  on conflict (user_id, year, month) do update set opening_balance = excluded.opening_balance;
insert into public.monthly_balances (user_id, year, month, opening_balance)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 2026, 1, 50)
  on conflict (user_id, year, month) do update set opening_balance = excluded.opening_balance;
do $$ begin
  if (select count(*) from public.monthly_balances where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') <> 1
     or (select profile_id from public.monthly_balances where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') is null
  then raise exception 't04_upsert_monthly_balance'; end if;
end $$;

select 'ALL PASSED' as result;
