-- Testes da fase 2 de PF+PJ (empresas). SEMPRE dentro de begin; ... rollback;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f2-a@example.invalid', '{"full_name":"Bia Empresária"}');
select set_config('request.jwt.claims',
  json_build_object('sub', 'bbbbbbbb-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

-- t2_01_template_pj: 12 categorias (3 receitas + 9 despesas); idempotente
do $$ declare a constant uuid := 'bbbbbbbb-0000-0000-0000-000000000001'; v_pj uuid; begin
  insert into public.financial_profiles (user_id, kind, name) values (a, 'pj', 'Bia LTDA') returning id into v_pj;
  perform public.apply_pj_template(v_pj);
  perform public.apply_pj_template(v_pj);
  if (select count(*) from public.categories where profile_id = v_pj and kind = 'receita') <> 3
     or (select count(*) from public.categories where profile_id = v_pj and kind = 'despesa') <> 9
     or (select count(*) from public.categories where profile_id = v_pj) <> 12
  then raise exception 't2_01_template_pj: contagem errada'; end if;
  if not exists (select 1 from public.categories where profile_id = v_pj and name = 'Impostos (DAS/Simples)')
  then raise exception 't2_01_template_pj: falta Impostos'; end if;
  begin
    perform public.apply_pj_template(public.pf_profile_id(a));
    raise exception 't2_01_template_pj: aceitou template PJ no PF';
  exception when sqlstate '23514' then null; end;
end $$;

-- t2_02_mesmo_nome_em_perfis
do $$ declare a constant uuid := 'bbbbbbbb-0000-0000-0000-000000000001'; v_pj uuid; begin
  select id into v_pj from public.financial_profiles where user_id = a and kind = 'pj';
  insert into public.categories (user_id, profile_id, name, kind) values (a, public.pf_profile_id(a), 'Aluguel', 'despesa');
  insert into public.categories (user_id, profile_id, name, kind) values (a, v_pj, 'Aluguel', 'despesa');
  begin
    insert into public.categories (user_id, profile_id, name, kind) values (a, v_pj, 'Aluguel', 'despesa');
    raise exception 't2_02_mesmo_nome_em_perfis: duplicou no mesmo perfil';
  exception when unique_violation then null; end;
end $$;

-- t2_03_pj_sem_aporte
do $$ declare a constant uuid := 'bbbbbbbb-0000-0000-0000-000000000001'; v_pj uuid; begin
  select id into v_pj from public.financial_profiles where user_id = a and kind = 'pj';
  begin
    insert into public.transactions (user_id, profile_id, occurred_on, amount, kind, description)
      values (a, v_pj, '2026-05-01', 10, 'reserva', 'aporte pj');
    raise exception 't2_03_pj_sem_aporte: aceitou aporte no PJ';
  exception when sqlstate '23514' then null; end;
  begin
    insert into public.categories (user_id, profile_id, name, kind) values (a, v_pj, 'Reserva PJ', 'reserva');
    raise exception 't2_03_pj_sem_aporte: aceitou categoria de aporte no PJ';
  exception when sqlstate '23514' then null; end;
  insert into public.transactions (user_id, profile_id, occurred_on, amount, kind, description)
    values (a, public.pf_profile_id(a), '2026-05-01', 10, 'reserva', 'aporte pf');
end $$;

-- t2_04_saldo_por_perfil: saldo inicial próprio da empresa
insert into public.monthly_balances (user_id, profile_id, year, month, opening_balance)
  select 'bbbbbbbb-0000-0000-0000-000000000001', id, 2026, 3, 500 from public.financial_profiles
  where user_id = 'bbbbbbbb-0000-0000-0000-000000000001' and kind = 'pj'
  on conflict (profile_id, year, month) do update set opening_balance = excluded.opening_balance;
do $$ declare v_pj uuid; r record; begin
  select id into v_pj from public.financial_profiles where user_id = 'bbbbbbbb-0000-0000-0000-000000000001' and kind = 'pj';
  select * into r from public.get_monthly_financial_summary(2026, 3, v_pj);
  if r.saldo_inicial <> 500 then raise exception 't2_04_saldo_por_perfil: %', r; end if;
  select * into r from public.get_monthly_financial_summary(2026, 3, public.pf_profile_id('bbbbbbbb-0000-0000-0000-000000000001'));
  if r.saldo_inicial <> 0 then raise exception 't2_04_saldo_por_perfil: PF herdou saldo da empresa: %', r; end if;
end $$;

-- t2_05_views_por_perfil
do $$ declare a constant uuid := 'bbbbbbbb-0000-0000-0000-000000000001'; v_pj uuid; v_cat uuid; begin
  select id into v_pj from public.financial_profiles where user_id = a and kind = 'pj';
  select id into v_cat from public.categories where profile_id = v_pj and name = 'Marketing';
  insert into public.transactions (user_id, profile_id, occurred_on, amount, kind, description, category_id)
    values (a, v_pj, '2026-04-10', 100, 'despesa', 'anúncio', v_cat);
  if (select total from public.category_breakdown where profile_id = v_pj and month = '2026-04-01' and category_id = v_cat) <> 100
  then raise exception 't2_05_views_por_perfil: breakdown PJ'; end if;
  if exists (select 1 from public.category_breakdown where profile_id = public.pf_profile_id(a) and month = '2026-04-01')
  then raise exception 't2_05_views_por_perfil: despesa PJ apareceu no PF'; end if;
  if not exists (select 1 from public.nce_distribution where profile_id = v_pj and month = '2026-04-01')
  then raise exception 't2_05_views_por_perfil: nce sem profile_id'; end if;
end $$;

-- t2_06_excluir_empresa
do $$ declare a constant uuid := 'bbbbbbbb-0000-0000-0000-000000000001'; v_pj uuid; v_pj2 uuid; begin
  select id into v_pj from public.financial_profiles where user_id = a and kind = 'pj' and name = 'Bia LTDA';
  begin
    perform public.delete_company(v_pj);
    raise exception 't2_06_excluir_empresa: excluiu empresa com lançamentos';
  exception when sqlstate '23514' then
    if sqlerrm not like '%Arquive%' then raise exception 't2_06_excluir_empresa: mensagem errada: %', sqlerrm; end if;
  end;
  insert into public.financial_profiles (user_id, kind, name) values (a, 'pj', 'Criada por engano') returning id into v_pj2;
  perform public.apply_pj_template(v_pj2);
  perform public.delete_company(v_pj2);
  if exists (select 1 from public.financial_profiles where id = v_pj2) or exists (select 1 from public.categories where profile_id = v_pj2)
  then raise exception 't2_06_excluir_empresa: sobrou empresa ou categorias'; end if;
  begin
    perform public.delete_company(public.pf_profile_id(a));
    raise exception 't2_06_excluir_empresa: excluiu o PF';
  exception when sqlstate '23514' then null; end;
end $$;

-- t2_07_template_pf_ainda_funciona (usuário logado, RLS ativo)
insert into auth.users (id, instance_id, aud, role, email) values
  ('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f2-b@example.invalid');
select set_config('request.jwt.claims',
  json_build_object('sub', 'bbbbbbbb-0000-0000-0000-000000000002', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.seed_default_categories('bbbbbbbb-0000-0000-0000-000000000002');
reset role;
do $$ begin
  if (select count(*) from public.categories where user_id = 'bbbbbbbb-0000-0000-0000-000000000002'
      and profile_id = public.pf_profile_id('bbbbbbbb-0000-0000-0000-000000000002')) < 20
  then raise exception 't2_07_template_pf_ainda_funciona'; end if;
end $$;

-- t2_08_nome_pf: nenhum PF com nome igual ao e-mail do dono
do $$ begin
  if exists (select 1 from public.financial_profiles fp join auth.users u on u.id = fp.user_id
             where fp.kind = 'pf' and fp.name = u.email)
  then raise exception 't2_08_nome_pf'; end if;
end $$;

-- t2_10_template_pf_nao_mexe_na_empresa: rodar o template da PF de novo
-- não renomeia categorias da empresa nem pendura subcategorias nela.
do $$ declare a constant uuid := 'bbbbbbbb-0000-0000-0000-000000000001'; v_pj uuid; begin
  select id into v_pj from public.financial_profiles where user_id = a and kind = 'pj' and name = 'Bia LTDA';
  insert into public.categories (user_id, profile_id, name, kind) values
    (a, v_pj, 'Alimentação', 'despesa'), (a, v_pj, 'Outros', 'receita');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform public.seed_default_categories(a);
  if not exists (select 1 from public.categories where profile_id = v_pj and name = 'Outros' and kind = 'receita')
  then raise exception 't2_10: renomeou categoria da empresa'; end if;
  if exists (select 1 from public.subcategories s join public.categories c on c.id = s.category_id
             where c.profile_id = v_pj and c.name = 'Alimentação')
  then raise exception 't2_10: subcategorias da PF foram para a empresa'; end if;
  if not exists (select 1 from public.subcategories s join public.categories c on c.id = s.category_id
                 where c.profile_id = public.pf_profile_id(a) and c.name = 'Alimentação')
  then raise exception 't2_10: PF ficou sem subcategorias de Alimentação'; end if;
end $$;

-- t2_11_empresa_de_outro_usuario: logado como B, não exclui nem aplica template na empresa de A
select set_config('request.jwt.claims',
  json_build_object('sub', 'bbbbbbbb-0000-0000-0000-000000000002', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ declare v_pj uuid; begin
  select id into v_pj from public.financial_profiles where name = 'Bia LTDA';
  if v_pj is not null then raise exception 't2_11: B enxerga a empresa de A'; end if;
end $$;
reset role;
do $$ declare v_pj uuid; begin
  select id into v_pj from public.financial_profiles where name = 'Bia LTDA';
  execute 'set local role authenticated';
  begin
    perform public.delete_company(v_pj);
    raise exception 't2_11: B excluiu empresa de A';
  exception when sqlstate '23514' then null; end;
  begin
    perform public.apply_pj_template(v_pj);
    raise exception 't2_11: B aplicou template na empresa de A';
  exception when sqlstate '23514' then null; end;
  execute 'reset role';
end $$;

select 'ALL PASSED' as result;
