-- Testes da fase 4 de PF+PJ (impostos e relatórios). SEMPRE dentro de begin; ... rollback;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data) values
  ('dddddddd-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f4@example.invalid', '{"full_name":"Duda"}');
insert into public.financial_profiles (user_id, kind, name) values ('dddddddd-0000-0000-0000-000000000001', 'pj', 'Ateliê');
select set_config('request.jwt.claims',
  json_build_object('sub', 'dddddddd-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

create temp table f4 as
select
  public.pf_profile_id('dddddddd-0000-0000-0000-000000000001') as pf,
  (select id from public.financial_profiles where user_id = 'dddddddd-0000-0000-0000-000000000001' and kind = 'pj') as pj,
  'dddddddd-0000-0000-0000-000000000001'::uuid as u;

-- t4_01_template_marca_imposto
do $$ declare r record; begin
  select * into r from f4;
  perform public.apply_pj_template(r.pj);
  if not exists (select 1 from public.categories where profile_id = r.pj and name = 'Impostos (DAS/Simples)' and is_tax) then
    raise exception 't4_01: Impostos (DAS/Simples) não veio marcado como imposto';
  end if;
  if exists (select 1 from public.categories where profile_id = r.pj and name <> 'Impostos (DAS/Simples)' and is_tax) then
    raise exception 't4_01: outra categoria do template veio marcada como imposto';
  end if;
end $$;

-- t4_02_is_tax_so_empresa
do $$ declare r record; begin
  select * into r from f4;
  begin
    insert into public.categories (user_id, profile_id, name, kind, is_tax) values (r.u, r.pf, 'IR', 'despesa', true);
    raise exception 't4_02: aceitou imposto na PF';
  exception when sqlstate '23514' then null; end;
  begin
    insert into public.categories (user_id, profile_id, name, kind, is_tax) values (r.u, r.pj, 'Receita imposto', 'receita', true);
    raise exception 't4_02: aceitou receita marcada como imposto';
  exception when sqlstate '23514' then null; end;
  update public.categories set is_tax = true where profile_id = r.pj and name = 'Contabilidade';
  if not exists (select 1 from public.categories where profile_id = r.pj and name = 'Contabilidade' and is_tax) then
    raise exception 't4_02: não marcou despesa da empresa';
  end if;
end $$;

-- t4_03_varios_meses
do $$ declare r record; n int; diff int; begin
  select * into r from f4;
  insert into public.transactions (user_id, profile_id, occurred_on, amount, kind, description, counterpart_profile_id, transfer_reason) values
    (r.u, r.pj, '2026-01-05', 8000, 'receita', 'vendas', null, null),
    (r.u, r.pj, '2026-01-10', 1000, 'despesa', 'custos', null, null),
    (r.u, r.pj, '2026-01-15', 3000, 'transferencia', 'pró-labore', r.pf, 'pro_labore'),
    (r.u, r.pf, '2026-02-03', 500, 'despesa', 'mercado', null, null);
  select count(*) into n from public.get_monthly_summaries('2026-01-01', 2);
  if n <> 6 then raise exception 't4_03: esperava 6 linhas, veio %', n; end if;
  select count(*) into diff from (
    select s.month, s.profile_id, s.saldo_inicial, s.total_receita, s.total_despesa, s.resultado_operacional,
           s.total_aportes, s.saldo_final, s.transf_recebidas, s.transf_enviadas, s.entradas_transferidas,
           s.pro_labore_pago, s.lucros_distribuidos
    from public.get_monthly_summaries('2026-01-01', 2) s
    except
    select g.month, p.id, g.saldo_inicial, g.total_receita, g.total_despesa, g.resultado_operacional,
           g.total_aportes, g.saldo_final, g.transf_recebidas, g.transf_enviadas, g.entradas_transferidas,
           g.pro_labore_pago, g.lucros_distribuidos
    from (values (2026, 1), (2026, 2)) ym(y, m)
    cross join (select id from public.financial_profiles where user_id = r.u union all select null) p
    cross join lateral public.get_monthly_financial_summary(ym.y, ym.m, p.id) g
  ) x;
  if diff <> 0 then raise exception 't4_03: % linhas não batem com o resumo mensal', diff; end if;
  if (select resultado_operacional from public.get_monthly_summaries('2026-01-01', 1) where profile_id = r.pj) <> 4000 then
    raise exception 't4_03: resultado da empresa em jan deveria ser 4000';
  end if;
end $$;

-- t4_04_limites
do $$ begin
  begin
    perform * from public.get_monthly_summaries('2026-01-01', 0);
    raise exception 't4_04: aceitou 0 meses';
  exception when sqlstate '22023' then null; end;
  begin
    perform * from public.get_monthly_summaries('2026-01-01', 25);
    raise exception 't4_04: aceitou 25 meses';
  exception when sqlstate '22023' then null; end;
end $$;

select 'ALL PASSED' as result;
