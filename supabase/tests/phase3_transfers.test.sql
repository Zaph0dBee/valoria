-- Testes da fase 3 de PF+PJ (transferências). SEMPRE dentro de begin; ... rollback;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data) values
  ('cccccccc-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f3@example.invalid', '{"full_name":"Caio"}');
insert into public.financial_profiles (user_id, kind, name) values ('cccccccc-0000-0000-0000-000000000001', 'pj', 'Loja');
select set_config('request.jwt.claims',
  json_build_object('sub', 'cccccccc-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

create temp table f3 as
select
  public.pf_profile_id('cccccccc-0000-0000-0000-000000000001') as pf,
  (select id from public.financial_profiles where user_id = 'cccccccc-0000-0000-0000-000000000001' and kind = 'pj') as pj,
  'cccccccc-0000-0000-0000-000000000001'::uuid as u;

-- t3_01_forma
do $$ declare r record; v_cat uuid; begin
  select * into r from f3;
  insert into public.categories (user_id, profile_id, name, kind) values (r.u, r.pj, 'Vendas', 'receita') returning id into v_cat;
  begin
    insert into public.transactions (user_id, profile_id, occurred_on, amount, kind, description, counterpart_profile_id, transfer_reason, category_id)
      values (r.u, r.pj, '2026-03-01', 1, 'transferencia', 'x', r.pf, 'pro_labore', v_cat);
    raise exception 't3_01: aceitou transferência com categoria';
  exception when sqlstate '23514' then null; end;
  begin
    insert into public.transactions (user_id, profile_id, occurred_on, amount, kind, description, counterpart_profile_id)
      values (r.u, r.pj, '2026-03-01', 1, 'transferencia', 'x', r.pf);
    raise exception 't3_01: aceitou transferência sem motivo';
  exception when sqlstate '23514' then null; end;
  begin
    insert into public.transactions (user_id, profile_id, occurred_on, amount, kind, description, counterpart_profile_id, transfer_reason)
      values (r.u, r.pj, '2026-03-01', 1, 'transferencia', 'x', r.pj, 'outro');
    raise exception 't3_01: aceitou transferência para o mesmo perfil';
  exception when sqlstate '23514' then null; end;
  begin
    insert into public.transactions (user_id, profile_id, occurred_on, amount, kind, description, counterpart_profile_id, transfer_reason)
      values (r.u, r.pj, '2026-03-01', 1, 'despesa', 'x', r.pf, 'outro');
    raise exception 't3_01: aceitou contraparte em despesa';
  exception when sqlstate '23514' then null; end;
end $$;

-- t3_02_direcao
do $$ declare r record; begin
  select * into r from f3;
  begin
    insert into public.transactions (user_id, profile_id, occurred_on, amount, kind, description, counterpart_profile_id, transfer_reason)
      values (r.u, r.pf, '2026-03-01', 1, 'transferencia', 'x', r.pj, 'pro_labore');
    raise exception 't3_02: aceitou pró-labore da PF para a empresa';
  exception when sqlstate '23514' then null; end;
  begin
    insert into public.transactions (user_id, profile_id, occurred_on, amount, kind, description, counterpart_profile_id, transfer_reason)
      values (r.u, r.pj, '2026-03-01', 1, 'transferencia', 'x', r.pf, 'aporte_capital');
    raise exception 't3_02: aceitou aporte de capital da empresa para a PF';
  exception when sqlstate '23514' then null; end;
end $$;

-- t3_03_resumo (março/2026)
do $$ declare r record; begin
  select * into r from f3;
  insert into public.transactions (user_id, profile_id, occurred_on, amount, kind, description, counterpart_profile_id, transfer_reason) values
    (r.u, r.pj, '2026-03-05', 10000, 'receita', 'vendas', null, null),
    (r.u, r.pj, '2026-03-06', 2000, 'despesa', 'fornecedor', null, null),
    (r.u, r.pj, '2026-03-10', 3000, 'transferencia', 'pró-labore', r.pf, 'pro_labore'),
    (r.u, r.pj, '2026-03-20', 4000, 'transferencia', 'lucros', r.pf, 'lucros'),
    (r.u, r.pf, '2026-03-12', 1500, 'despesa', 'mercado', null, null),
    (r.u, r.pf, '2026-03-15', 500, 'transferencia', 'aporte na loja', r.pj, 'aporte_capital');
end $$;
do $$ declare r record; s record; begin
  select * into r from f3;
  select * into s from public.get_monthly_financial_summary(2026, 3, r.pj);
  if (s.total_receita, s.resultado_operacional, s.transf_enviadas, s.transf_recebidas, s.pro_labore_pago, s.lucros_distribuidos, s.saldo_final)
     <> (10000, 5000, 7000, 500, 3000, 4000, 1500) then raise exception 't3_03 PJ: %', s; end if;
  select * into s from public.get_monthly_financial_summary(2026, 3, r.pf);
  if (s.total_receita, s.entradas_transferidas, s.resultado_operacional, s.transf_recebidas, s.transf_enviadas, s.saldo_final)
     <> (0, 7000, 5500, 7000, 500, 5000) then raise exception 't3_03 PF: %', s; end if;
  select * into s from public.get_monthly_financial_summary(2026, 3, null::uuid);
  if (s.total_receita, s.total_despesa, s.resultado_operacional, s.transf_recebidas, s.transf_enviadas, s.entradas_transferidas, s.saldo_final)
     <> (10000, 3500, 6500, 0, 0, 0, 6500) then raise exception 't3_03 consolidado: %', s; end if;
  select * into s from public.get_monthly_financial_summary(2026, 3);
  if s.saldo_final <> 6500 then raise exception 't3_03 assinatura de 2 argumentos: %', s; end if;
end $$;

-- t3_04_saldo_herda_transferencias (abril/2026)
do $$ declare r record; s record; begin
  select * into r from f3;
  select * into s from public.get_monthly_financial_summary(2026, 4, r.pj);
  if s.saldo_inicial <> 1500 then raise exception 't3_04 PJ: %', s; end if;
  select * into s from public.get_monthly_financial_summary(2026, 4, r.pf);
  if s.saldo_inicial <> 5000 then raise exception 't3_04 PF: %', s; end if;
  select * into s from public.get_monthly_financial_summary(2026, 4, null::uuid);
  if s.saldo_inicial <> 6500 then raise exception 't3_04 consolidado: %', s; end if;
end $$;

-- t3_06_categoria_proibida
do $$ declare r record; begin
  select * into r from f3;
  begin
    insert into public.categories (user_id, profile_id, name, kind) values (r.u, r.pf, 'Transf', 'transferencia');
    raise exception 't3_06: aceitou categoria de transferência';
  exception when check_violation then null; end;
end $$;

-- t3_05_contraparte_arquivada (por último: arquiva a empresa)
do $$ declare r record; begin
  select * into r from f3;
  update public.financial_profiles set archived = true where id = r.pj;
  begin
    insert into public.transactions (user_id, profile_id, occurred_on, amount, kind, description, counterpart_profile_id, transfer_reason)
      values (r.u, r.pj, '2026-04-01', 1, 'transferencia', 'x', r.pf, 'pro_labore');
    raise exception 't3_05: aceitou transferência saindo de empresa arquivada';
  exception when sqlstate '23514' then null; end;
  begin
    insert into public.transactions (user_id, profile_id, occurred_on, amount, kind, description, counterpart_profile_id, transfer_reason)
      values (r.u, r.pf, '2026-04-01', 1, 'transferencia', 'x', r.pj, 'outro');
    raise exception 't3_05: aceitou transferência para empresa arquivada';
  exception when sqlstate '23514' then null; end;
end $$;

select 'ALL PASSED' as result;
