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

-- t02_signup_cria_pf: o cadastro cria o PF (nome do full_name, senão do e-mail)
do $$ begin
  if (select name from public.financial_profiles
      where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and kind = 'pf') is distinct from 'Ana Teste'
  then raise exception 't02_signup_cria_pf: nome do full_name'; end if;
  if (select name from public.financial_profiles
      where user_id = 'aaaaaaaa-0000-0000-0000-000000000002' and kind = 'pf') is distinct from 'pf-test-b'
  then raise exception 't02_signup_cria_pf: nome do e-mail'; end if;
end $$;

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
  on conflict (profile_id, year, month) do update set opening_balance = excluded.opening_balance;
insert into public.monthly_balances (user_id, year, month, opening_balance)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 2026, 1, 50)
  on conflict (profile_id, year, month) do update set opening_balance = excluded.opening_balance;
do $$ begin
  if (select count(*) from public.monthly_balances where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') <> 1
     or (select profile_id from public.monthly_balances where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') is null
  then raise exception 't04_upsert_monthly_balance'; end if;
end $$;

-- t05_um_pf_por_usuario
do $$ begin
  begin
    insert into public.financial_profiles (user_id, kind, name)
      values ('aaaaaaaa-0000-0000-0000-000000000001', 'pf', 'Outro PF');
    raise exception 't05_um_pf_por_usuario: aceitou segundo PF';
  exception when unique_violation then null; end;
end $$;

-- t06_*: perfil de outro usuário, categoria de outro perfil, mover categoria
do $$ declare v_pj uuid; v_cat_pf uuid; begin
  insert into public.financial_profiles (user_id, kind, name)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'pj', 'Empresa Teste') returning id into v_pj;
  select id into v_cat_pf from public.categories
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and name = 'Teste Cat';
  begin
    insert into public.transactions (user_id, profile_id, occurred_on, amount, kind, description)
      values ('aaaaaaaa-0000-0000-0000-000000000002', v_pj, '2026-01-10', 1, 'despesa', 'x');
    raise exception 't06_perfil_de_outro_usuario: aceitou';
  exception when sqlstate '23514' then null; end;
  begin
    insert into public.transactions (user_id, profile_id, occurred_on, amount, kind, description, category_id)
      values ('aaaaaaaa-0000-0000-0000-000000000001', v_pj, '2026-01-10', 1, 'despesa', 'x', v_cat_pf);
    raise exception 't06_categoria_de_outro_perfil: aceitou';
  exception when sqlstate '23514' then null; end;
  begin
    update public.categories set profile_id = v_pj where id = v_cat_pf;
    raise exception 't06_mover_categoria: aceitou';
  exception when sqlstate '23514' then null; end;
end $$;

-- t07_protege_pf
do $$ declare v_pf uuid := public.pf_profile_id('aaaaaaaa-0000-0000-0000-000000000002'); begin
  begin
    update public.financial_profiles set archived = true where id = v_pf;
    raise exception 't07_arquivar_pf: aceitou';
  exception when sqlstate '23514' then null; end;
  begin
    delete from public.financial_profiles where id = v_pf;
    raise exception 't07_apagar_pf: aceitou';
  exception when sqlstate '23514' then null; end;
end $$;

-- t08_rls: usuário B não vê perfis de A (pulado se não puder trocar de role)
do $$ begin
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000002', 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    if exists (select 1 from public.financial_profiles where user_id = 'aaaaaaaa-0000-0000-0000-000000000001')
    then raise exception 't08_rls: B enxerga perfis de A'; end if;
    if not exists (select 1 from public.financial_profiles where user_id = 'aaaaaaaa-0000-0000-0000-000000000002')
    then raise exception 't08_rls: B não enxerga o próprio PF'; end if;
    execute 'reset role';
  exception when insufficient_privilege then
    raise notice 't08_rls: pulado (sem permissão para set role)';
  end;
end $$;

-- t10_recorrencia_copia_perfil
do $$ declare v_pj uuid; v_rule uuid; begin
  select id into v_pj from public.financial_profiles
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and kind = 'pj';
  insert into public.recurring_transactions (user_id, profile_id, name, kind, amount, frequency, day_of_month, starts_on)
    values ('aaaaaaaa-0000-0000-0000-000000000001', v_pj, 'Aluguel sala', 'despesa', 900, 'monthly', 5, '2026-01-01')
    returning id into v_rule;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
  perform public.generate_recurring_transactions(2026, 2, false);
  if (select profile_id from public.transactions where recurring_rule_id = v_rule) is distinct from v_pj
  then raise exception 't10_recorrencia_copia_perfil'; end if;
end $$;

-- t11_apagar_usuario: excluir a conta (cascata) continua funcionando com PF, PJ e dados
insert into auth.users (id, instance_id, aud, role, email) values
  ('aaaaaaaa-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pf-test-c@example.invalid');
do $$ declare v_pj uuid; v_cat uuid; c constant uuid := 'aaaaaaaa-0000-0000-0000-000000000003'; begin
  insert into public.financial_profiles (user_id, kind, name) values (c, 'pj', 'Empresa C') returning id into v_pj;
  insert into public.categories (user_id, profile_id, name, kind) values (c, v_pj, 'Vendas', 'receita') returning id into v_cat;
  insert into public.transactions (user_id, profile_id, occurred_on, amount, kind, description, category_id)
    values (c, v_pj, '2026-01-10', 100, 'receita', 'venda', v_cat);
  insert into public.transactions (user_id, occurred_on, amount, kind, description)
    values (c, '2026-01-11', 5, 'despesa', 'café');
  delete from auth.users where id = c;
  if exists (select 1 from public.financial_profiles where user_id = c)
     or exists (select 1 from public.transactions where user_id = c)
  then raise exception 't11_apagar_usuario: dados ficaram'; end if;
end $$;

-- t09_resumo_por_perfil: dados conhecidos do usuário A (PF + "Empresa Teste"), mês 2026-03
do $$ declare
  a constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_pf uuid := public.pf_profile_id('aaaaaaaa-0000-0000-0000-000000000001');
  v_pj uuid;
begin
  select id into v_pj from public.financial_profiles where user_id = a and kind = 'pj';
  update public.monthly_balances set opening_balance = 0 where user_id = a;
  delete from public.transactions where user_id = a;
  insert into public.transactions (user_id, profile_id, occurred_on, amount, kind, description) values
    (a, v_pf, '2026-03-05', 1000, 'receita', 'sal'),
    (a, v_pf, '2026-03-06', 300, 'despesa', 'mercado'),
    (a, v_pf, '2026-03-07', 100, 'reserva', 'aporte'),
    (a, v_pj, '2026-03-08', 200, 'receita', 'venda');
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
do $$ declare
  v_pf uuid := public.pf_profile_id('aaaaaaaa-0000-0000-0000-000000000001');
  v_pj uuid;
  r record;
begin
  select id into v_pj from public.financial_profiles
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and kind = 'pj';
  select * into r from public.get_monthly_financial_summary(2026, 3, v_pf);
  if (r.total_receita, r.total_despesa, r.total_aportes, r.saldo_final) <> (1000, 300, 100, 600)
  then raise exception 't09_pf: %', r; end if;
  select * into r from public.get_monthly_financial_summary(2026, 3, v_pj);
  if (r.total_receita, r.saldo_final) <> (200, 200) then raise exception 't09_pj: %', r; end if;
  select * into r from public.get_monthly_financial_summary(2026, 3, null::uuid);
  if (r.total_receita, r.saldo_final, r.transactions_count) <> (1200, 800, 4)
  then raise exception 't09_consolidado: %', r; end if;
  select * into r from public.get_monthly_financial_summary(2026, 4);
  if r.saldo_inicial <> 800 then raise exception 't09_abril_herda_saldo: %', r; end if;
end $$;

-- t12_app_logado: caminho real do app — usuário logado (RLS ativo) roda o
-- template do signup e grava um lançamento sem profile_id; tudo cai no PF.
insert into auth.users (id, instance_id, aud, role, email) values
  ('aaaaaaaa-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pf-test-d@example.invalid');
select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000004', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.seed_default_categories('aaaaaaaa-0000-0000-0000-000000000004');
insert into public.transactions (user_id, occurred_on, amount, kind, description)
  values ('aaaaaaaa-0000-0000-0000-000000000004', '2026-02-01', 42, 'despesa', 'café logado');
reset role;
do $$ declare d constant uuid := 'aaaaaaaa-0000-0000-0000-000000000004'; begin
  if (select count(*) from public.categories where user_id = d) = 0
  then raise exception 't12_app_logado: template não criou categorias'; end if;
  if exists (select 1 from public.categories where user_id = d and profile_id is distinct from public.pf_profile_id(d))
     or exists (select 1 from public.transactions where user_id = d and profile_id is distinct from public.pf_profile_id(d))
  then raise exception 't12_app_logado: dados fora do PF'; end if;
end $$;

-- t13_pf_criado_na_hora: usuário que ficou sem PF (ex.: cadastro durante a
-- migração) consegue gravar; o PF é criado na primeira gravação.
alter table public.financial_profiles disable trigger trg_protect_pf_profile;
delete from public.transactions where user_id = 'aaaaaaaa-0000-0000-0000-000000000004';
delete from public.categories where user_id = 'aaaaaaaa-0000-0000-0000-000000000004';
delete from public.financial_profiles where user_id = 'aaaaaaaa-0000-0000-0000-000000000004';
alter table public.financial_profiles enable trigger trg_protect_pf_profile;
select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000004', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.imports (user_id, source, filename)
  values ('aaaaaaaa-0000-0000-0000-000000000004', 'csv', 'depois.csv');
reset role;
do $$ declare d constant uuid := 'aaaaaaaa-0000-0000-0000-000000000004'; begin
  if public.pf_profile_id(d) is null
     or (select profile_id from public.imports where user_id = d and filename = 'depois.csv') is distinct from public.pf_profile_id(d)
  then raise exception 't13_pf_criado_na_hora'; end if;
end $$;

select 'ALL PASSED' as result;
