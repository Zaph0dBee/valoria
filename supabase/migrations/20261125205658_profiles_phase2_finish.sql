-- ============================================================================
-- Valoria — PF + PJ, fase 2 (final): aplicada DEPOIS do deploy do app que faz
-- upsert de saldo inicial por (profile_id, year, month).
-- ============================================================================

-- 1) Saldo inicial passa a ser único só por perfil: PF e empresa podem ter
--    saldo inicial no mesmo mês.
alter table public.monthly_balances drop constraint if exists monthly_balances_user_id_year_month_key;

-- 2) Não mover lançamentos (ou outros dados) para um perfil arquivado.
--    Antes só a inserção era barrada; a edição que trocava o perfil passava.
create or replace function public.validate_profile_relations()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid;
  v_archived boolean;
  v_profile_kind public.profile_kind;
  v_category uuid;
  v_category_profile uuid;
begin
  select fp.user_id, fp.archived, fp.kind into v_owner, v_archived, v_profile_kind
  from public.financial_profiles fp
  where fp.id = new.profile_id;

  if v_owner is null or v_owner <> new.user_id then
    raise exception 'Perfil inválido para este usuário' using errcode = '23514';
  end if;

  if v_archived and (tg_op = 'INSERT' or new.profile_id is distinct from old.profile_id) then
    raise exception 'Este perfil está arquivado' using errcode = '23514';
  end if;

  if tg_table_name = 'categories' and tg_op = 'UPDATE' and new.profile_id is distinct from old.profile_id then
    raise exception 'Não é possível mover uma categoria para outro perfil' using errcode = '23514';
  end if;

  if v_profile_kind = 'pj'
     and tg_table_name in ('transactions', 'recurring_transactions', 'categories')
     and (to_jsonb(new) ->> 'kind') = 'reserva' then
    raise exception 'Empresas não fazem aporte em metas. Transfira para a PF primeiro.' using errcode = '23514';
  end if;

  if tg_table_name in ('transactions', 'budgets', 'recurring_transactions') then
    v_category := (to_jsonb(new) ->> 'category_id')::uuid;
    if v_category is not null then
      select c.profile_id into v_category_profile from public.categories c where c.id = v_category;
      if v_category_profile is distinct from new.profile_id then
        raise exception 'A categoria pertence a outro perfil' using errcode = '23514';
      end if;
    end if;
  end if;

  return new;
end;
$$;
