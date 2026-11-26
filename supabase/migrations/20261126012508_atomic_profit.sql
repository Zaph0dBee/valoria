-- Registro de lucro atômico: a checagem do disponível e a gravação acontecem na
-- mesma chamada, sob uma trava por empresa e mês. Dois cliques simultâneos (duas
-- abas) não conseguem mais registrar o mesmo lucro sugerido duas vezes.
-- Só adiciona uma função; nada existente muda.

create or replace function public.register_profit_distribution(
  target_profile uuid,
  profit_amount numeric,
  profit_date date,
  profit_description text,
  only_available boolean default true
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_pf uuid;
  v_amount numeric := round(profit_amount, 2);
  v_resultado numeric;
  v_lucros numeric;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;
  if v_amount is null or v_amount <= 0 or profit_date is null then
    raise exception 'Valor ou data inválidos' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.financial_profiles fp
    where fp.id = target_profile and fp.user_id = v_user and fp.kind = 'pj' and not fp.archived
  ) then
    raise exception 'Empresa não encontrada' using errcode = '23514';
  end if;

  v_pf := public.pf_profile_id(v_user);
  if v_pf is null then
    raise exception 'Perfil pessoal não encontrado' using errcode = '23514';
  end if;

  -- Uma chamada por vez para a mesma empresa e mês; a leitura do resumo abaixo,
  -- feita depois da trava, já enxerga o lucro gravado por quem chegou antes.
  perform pg_advisory_xact_lock(
    hashtextextended('profit:' || target_profile::text || ':' || to_char(profit_date, 'YYYY-MM'), 0));

  if only_available then
    select s.resultado_operacional, s.lucros_distribuidos into v_resultado, v_lucros
    from public.get_monthly_financial_summary(
      extract(year from profit_date)::int, extract(month from profit_date)::int, target_profile) s;
    if v_amount > greatest(round(coalesce(v_resultado, 0) - coalesce(v_lucros, 0), 2), 0) then
      raise exception 'Este lucro já foi registrado. Atualize a página para ver o disponível.' using errcode = '23514';
    end if;
  end if;

  insert into public.transactions
    (user_id, profile_id, occurred_on, amount, kind, description, counterpart_profile_id, transfer_reason, source)
  values
    (v_user, target_profile, profit_date, v_amount, 'transferencia', left(profit_description, 200), v_pf, 'lucros', 'manual')
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.register_profit_distribution(uuid, numeric, date, text, boolean) from public, anon;
grant execute on function public.register_profit_distribution(uuid, numeric, date, text, boolean) to authenticated;
