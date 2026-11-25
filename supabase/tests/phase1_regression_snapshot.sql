-- t09_resumo_identico_producao: o resumo do painel (2 argumentos) de TODOS os
-- usuários com lançamentos não pode mudar nem um centavo com a migration.
--
-- Uso: substituir a linha marcada pelo conteúdo da migration e rodar tudo
-- entre begin; e rollback; (ver scripts/db-dry-run.md). Esperado: REGRESSION OK.

-- Captura em laço explícito: o "usuário logado" (claims) precisa ser trocado
-- ANTES de cada chamada; set_config dentro de um JOIN não tem ordem garantida.
create or replace function pg_temp.snapshot_summaries(target text) returns void language plpgsql as $$
declare u uuid; ym record;
begin
  for u in select distinct user_id from public.transactions loop
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    for ym in select * from (values (2026, 9), (2026, 10), (2026, 11)) v(y, m) loop
      execute format(
        'insert into %I select %L::uuid, %s, %s, s.* from public.get_monthly_financial_summary(%s, %s) s',
        target, u, ym.y, ym.m, ym.y, ym.m);
    end loop;
  end loop;
end $$;

create temp table snap_before (
  user_id uuid, y int, m int, month date, saldo_inicial numeric, total_receita numeric,
  total_despesa numeric, resultado_operacional numeric, total_aportes numeric,
  disponivel_antes_aportes numeric, saldo_final numeric, transactions_count bigint);
select pg_temp.snapshot_summaries('snap_before');

-- <migration aqui>

create temp table snap_after (like snap_before);
select pg_temp.snapshot_summaries('snap_after');

do $$ begin
  if (select count(*) from snap_before) = 0 then
    raise exception 't09_resumo_identico_producao: snapshot vazio';
  end if;
  if exists (select * from snap_before except select * from snap_after)
     or exists (select * from snap_after except select * from snap_before) then
    raise exception 't09_resumo_identico_producao: números mudaram';
  end if;
end $$;

select 'REGRESSION OK' as result, (select count(*) from snap_before) as linhas_comparadas;
