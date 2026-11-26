-- Registro de lucro atômico (checagem do disponível + gravação na mesma chamada).
-- SEMPRE dentro de begin; ... rollback;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data) values
  ('eeeeeeee-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lucro@example.invalid', '{"full_name":"Lia"}');
insert into public.financial_profiles (user_id, kind, name) values ('eeeeeeee-0000-0000-0000-000000000001', 'pj', 'Oficina');
select set_config('request.jwt.claims',
  json_build_object('sub', 'eeeeeeee-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

create temp table fl as
select
  public.pf_profile_id('eeeeeeee-0000-0000-0000-000000000001') as pf,
  (select id from public.financial_profiles where user_id = 'eeeeeeee-0000-0000-0000-000000000001' and kind = 'pj') as pj,
  'eeeeeeee-0000-0000-0000-000000000001'::uuid as u;

-- tl_01_registra_e_bloqueia_repeticao
do $$ declare r record; v_id uuid; v_tx record; begin
  select * into r from fl;
  insert into public.transactions (user_id, profile_id, occurred_on, amount, kind, description)
    values (r.u, r.pj, '2026-05-10', 1000, 'receita', 'vendas');
  v_id := public.register_profit_distribution(r.pj, 1000, '2026-05-31', 'Lucros de maio · Oficina', true);
  select * into v_tx from public.transactions where id = v_id;
  if v_tx.kind <> 'transferencia' or v_tx.transfer_reason <> 'lucros' or v_tx.counterpart_profile_id <> r.pf
     or v_tx.profile_id <> r.pj or v_tx.amount <> 1000 then
    raise exception 'tl_01: lançamento de lucro com forma errada';
  end if;
  begin
    perform public.register_profit_distribution(r.pj, 1000, '2026-05-31', 'Lucros de maio · Oficina', true);
    raise exception 'tl_01: registrou o mesmo lucro sugerido duas vezes';
  exception when sqlstate '23514' then null; end;
  begin
    perform public.register_profit_distribution(r.pj, 0.01, '2026-05-31', 'x', true);
    raise exception 'tl_01: passou do disponível (zero)';
  exception when sqlstate '23514' then null; end;
end $$;

-- tl_02_outro_valor_pode_passar_do_disponivel
do $$ declare r record; begin
  select * into r from fl;
  perform public.register_profit_distribution(r.pj, 500, '2026-05-31', 'Lucro acumulado', false);
  if (select count(*) from public.transactions where profile_id = r.pj and transfer_reason = 'lucros') <> 2 then
    raise exception 'tl_02: "outro valor" deveria registrar';
  end if;
end $$;

-- tl_03_entradas_invalidas
do $$ declare r record; begin
  select * into r from fl;
  begin
    perform public.register_profit_distribution(r.pj, 0, '2026-05-31', 'x', false);
    raise exception 'tl_03: aceitou valor zero';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.register_profit_distribution(r.pf, 10, '2026-05-31', 'x', false);
    raise exception 'tl_03: aceitou PF como empresa';
  exception when sqlstate '23514' then null; end;
  update public.financial_profiles set archived = true where id = r.pj;
  begin
    perform public.register_profit_distribution(r.pj, 10, '2026-05-31', 'x', false);
    raise exception 'tl_03: aceitou empresa arquivada';
  exception when sqlstate '23514' then null; end;
  update public.financial_profiles set archived = false where id = r.pj;
end $$;

-- tl_04_outro_usuario
do $$ declare r record; begin
  select * into r from fl;
  perform set_config('request.jwt.claims',
    json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  begin
    perform public.register_profit_distribution(r.pj, 10, '2026-05-31', 'x', false);
    raise exception 'tl_04: outro usuário registrou lucro na empresa';
  exception when sqlstate '23514' then null; end;
  perform set_config('request.jwt.claims',
    json_build_object('sub', r.u, 'role', 'authenticated')::text, true);
end $$;

select 'ALL PASSED' as result;
