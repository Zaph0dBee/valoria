# PF + PJ — Fase 1 (Fundação) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduzir perfis financeiros no banco (um PF por usuário, PJ no futuro) e ligar todos os dados existentes ao perfil PF, sem mudar nada do que o usuário vê.

**Architecture:** Uma única migration SQL (`financial_profiles` + `profile_id` nas tabelas de dados + backfill + triggers de preenchimento/integridade + resumo mensal por perfil). Triggers `before insert` preenchem `profile_id` quando o app não envia, então o código atual continua funcionando sem alteração. A migration é ensaiada dentro de `begin … rollback` contra o banco de produção junto com um script de testes SQL, e só é aplicada de verdade na última tarefa.

**Tech Stack:** Postgres 17 (Supabase, RLS, `security_invoker`), Supabase MCP (`execute_sql`, `apply_migration`), Next.js 16, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-25-pf-pj-perfis-design.md` (seções "Modelo de dados", "Consultas do painel", "Restrições", "Fases sugeridas" item 1).

## Global Constraints

- Projeto Supabase: `tgtsfodmdoclscklhglz`. Produção tem **usuários reais (27 em 2026-11-25)**; nenhum dado pode ser perdido ou alterado além de receber `profile_id`.
- Migration idempotente no estilo do repo (`if not exists`, `create or replace`, `drop … if exists`), em `supabase/migrations/`. Após `apply_migration`, renomear o arquivo para a versão que o Supabase registrou (`list_migrations`).
- Nomes fixados pelo spec: tabela `financial_profiles`; enum `profile_kind` com valores `pf`, `pj`; coluna `profile_id` em `transactions`, `categories`, `monthly_balances`, `imports`, `budgets`, `recurring_transactions`.
- **Fora da fase 1:** mudar índices únicos de `categories` (`user_id,name,kind`) e `monthly_balances` (`user_id,year,month`); tipo `transferencia`; qualquer tela nova. O app deve ficar visualmente idêntico.
- Funções novas: `security invoker` + `set search_path = public` (ou `''`), como as existentes; triggers de validação levantam `errcode = '23514'` com mensagem em pt-BR.
- Fluxo de entrega aprovado: `npm run check` + `npm run build` + `npm run test:e2e` verdes → commit → push direto na `main` (Vercel publica).

## Review Focus

1. **Usuário sem linha em `profiles` ou sem e-mail** (contas antigas/telefone) — o backfill não pode falhar nem criar perfil sem nome; nome cai para `'Você'`. Teste: `t01_backfill_nome_fallback` (Task 1).
2. **Insert do app sem `profile_id`** (lançamento manual, import, categoria, template do signup, meta, saldo inicial via upsert) — deve continuar funcionando e cair no PF. Testes: `t03_default_fill_*` (Task 1) e e2e existente (Task 4).
3. **Upsert do saldo inicial** com `onConflict: 'user_id,year,month'` continua válido após a nova coluna. Teste: `t04_upsert_monthly_balance` (Task 1).
4. **Lançamento ligado a categoria de outro perfil ou perfil de outro usuário** — tem que ser recusado no banco, não só no app. Testes: `t06_*` (Task 2).
5. **Resumo mensal do painel** (`get_monthly_financial_summary(ano, mês)`) devolve exatamente os mesmos números de antes para todos os usuários. Teste: `t09_resumo_identico_producao` (Task 3) compara antes/depois para os 27 usuários dentro do ensaio.

---

## File Structure

| arquivo | responsabilidade |
|---|---|
| `supabase/migrations/2026112500XXXX_financial_profiles.sql` (criar; versão final definida no apply) | toda a mudança de banco da fase 1 |
| `supabase/tests/phase1_financial_profiles.test.sql` (criar) | asserções SQL; roda sempre dentro de `begin … rollback` |
| `scripts/db-dry-run.md` (criar, curto) | como ensaiar migration + testes pelo MCP (para fases futuras) |
| `src/types/database.ts` (modificar) | tipo da tabela nova e `profile_id` nas tabelas existentes |

**Como rodar os testes SQL (vale para todas as tasks):** concatenar, numa única chamada `mcp__plugin_supabase_supabase__execute_sql` no projeto `tgtsfodmdoclscklhglz`:

```
begin;
<conteúdo atual do arquivo de migration>
<conteúdo de supabase/tests/phase1_financial_profiles.test.sql>
rollback;
```

O script de testes termina com `select 'ALL PASSED' as result;`. Qualquer falha aparece como erro com o nome do teste (`raise exception 't0X_…: …'`). Antes de a migration existir, rodar só `begin; <testes>; rollback;` para ver falhar.

Os testes criam usuários sintéticos em `auth.users` (ids fixos `aaaaaaaa-…-0001`, `…-0002`, e-mails `@example.invalid`) e simulam login com:

```sql
select set_config('request.jwt.claims', json_build_object('sub', '<uuid>', 'role', 'authenticated')::text, true);
set local role authenticated;   -- para testar RLS; `reset role;` para voltar
```

Se `set local role authenticated` for negado pelo MCP, os testes de RLS (`t08`) são marcados como pulados com `raise notice` e o resto roda como `postgres` (auth.uid() funciona pelas claims).

---

### Task 1: Tabela de perfis, colunas e backfill com preenchimento automático

**Files:**
- Create: `supabase/migrations/2026112500XXXX_financial_profiles.sql`
- Create: `supabase/tests/phase1_financial_profiles.test.sql`
- Create: `scripts/db-dry-run.md`

**Interfaces:**
- Produces:
  - `create type public.profile_kind as enum ('pf', 'pj')`
  - `public.financial_profiles(id uuid pk default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade, kind profile_kind not null, name text not null check (length(trim(name)) > 0), document text null check (document ~ '^[0-9]{11}$|^[0-9]{14}$'), color text not null default '#B99154', archived boolean not null default false, sort_order int not null default 0, created_at, updated_at)`; RLS "dono tudo" no padrão das outras tabelas; trigger `set_updated_at`.
  - Índice único parcial `uq_financial_profiles_one_pf on financial_profiles(user_id) where kind = 'pf'`; índice `idx_financial_profiles_user(user_id) where not archived`.
  - `profile_id uuid not null references financial_profiles(id) on delete restrict` em `transactions, categories, monthly_balances, imports, budgets, recurring_transactions` + índice `(profile_id)` em cada.
  - `public.pf_profile_id(target_user uuid) returns uuid` — `stable`, `security invoker`; id do perfil PF do usuário.
  - `public.fill_default_profile()` trigger `before insert` nas 6 tabelas: se `new.profile_id is null` → usa o `profile_id` da categoria quando a tabela tem `category_id` preenchido (`transactions`, `budgets`, `recurring_transactions`); senão `pf_profile_id(new.user_id)`.

- [ ] **Step 1: Escrever os testes da Task 1** em `supabase/tests/phase1_financial_profiles.test.sql`

```sql
-- t01_backfill: nenhum dado sem perfil e exatamente 1 PF por usuário
do $$ begin
  if exists (select 1 from transactions where profile_id is null)
     or exists (select 1 from categories where profile_id is null)
     or exists (select 1 from monthly_balances where profile_id is null)
     or exists (select 1 from imports where profile_id is null)
     or exists (select 1 from budgets where profile_id is null)
     or exists (select 1 from recurring_transactions where profile_id is null)
  then raise exception 't01_backfill: há linhas sem profile_id'; end if;
  if (select count(*) from auth.users u where (select count(*) from financial_profiles p where p.user_id = u.id and p.kind = 'pf') <> 1) > 0
  then raise exception 't01_backfill: usuário sem exatamente 1 perfil PF'; end if;
  if exists (select 1 from transactions t join financial_profiles p on p.id = t.profile_id where p.user_id <> t.user_id or p.kind <> 'pf')
  then raise exception 't01_backfill: lançamento ligado a perfil errado'; end if;
end $$;

-- t01_backfill_nome_fallback: nenhum perfil com nome vazio
do $$ begin
  if exists (select 1 from financial_profiles where trim(name) = '')
  then raise exception 't01_backfill_nome_fallback: perfil sem nome'; end if;
end $$;

-- Usuários sintéticos (signup dispara handle_new_user).
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pf-test-a@example.invalid', '{"full_name":"Ana Teste"}'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pf-test-b@example.invalid', '{}');

-- t02_signup_cria_pf (Task 2 implementa; aqui só garante dados para t03)
-- t03_default_fill_*: insert sem profile_id cai no PF do dono
do $$ declare v_cat uuid; v_tx uuid; begin
  insert into categories (user_id, name, kind) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Teste Cat', 'despesa') returning id into v_cat;
  if (select profile_id from categories where id = v_cat) is distinct from pf_profile_id('aaaaaaaa-0000-0000-0000-000000000001')
  then raise exception 't03_default_fill_categoria'; end if;
  insert into transactions (user_id, occurred_on, amount, kind, description, category_id)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '2026-01-10', 10, 'despesa', 'x', v_cat) returning id into v_tx;
  if (select profile_id from transactions where id = v_tx) is distinct from pf_profile_id('aaaaaaaa-0000-0000-0000-000000000001')
  then raise exception 't03_default_fill_lancamento'; end if;
  insert into imports (user_id, source, filename) values ('aaaaaaaa-0000-0000-0000-000000000001', 'csv', 'x.csv');
  if exists (select 1 from imports where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and profile_id is null)
  then raise exception 't03_default_fill_import'; end if;
end $$;

-- t04_upsert_monthly_balance: o upsert do app (onConflict user_id,year,month) segue válido
insert into monthly_balances (user_id, year, month, opening_balance) values ('aaaaaaaa-0000-0000-0000-000000000001', 2026, 1, 50)
  on conflict (user_id, year, month) do update set opening_balance = excluded.opening_balance;
insert into monthly_balances (user_id, year, month, opening_balance) values ('aaaaaaaa-0000-0000-0000-000000000001', 2026, 1, 50)
  on conflict (user_id, year, month) do update set opening_balance = excluded.opening_balance;
do $$ begin
  if (select count(*) from monthly_balances where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') <> 1
     or (select profile_id from monthly_balances where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') is null
  then raise exception 't04_upsert_monthly_balance'; end if;
end $$;

select 'ALL PASSED' as result;
```

> Os usuários sintéticos precisam existir **antes** de `handle_new_user` criar o PF (Task 2). Até a Task 2, a migration da Task 1 garante o PF dos sintéticos com o mesmo backfill idempotente — por isso o backfill fica numa função `public.ensure_pf_profiles()` (Interfaces da Task 2) chamada no fim da migration **e** chamada pelo teste logo após o insert em `auth.users` enquanto a Task 2 não existir. Na Task 2 essa chamada no teste é removida.

- [ ] **Step 2: Rodar só os testes (sem migration) e ver falhar**

Run: `begin; <testes>; rollback;` via `execute_sql`.
Expected: erro `relation "financial_profiles" does not exist` (ou coluna `profile_id` inexistente).

- [ ] **Step 3: Escrever a migration da Task 1**

Ordem dentro do arquivo: enum → tabela + índices + RLS + trigger updated_at → `pf_profile_id` → `ensure_pf_profiles()` (cria PF para todo `auth.users` sem PF; nome = `coalesce(nullif(trim(p.full_name), ''), nullif(split_part(u.email, '@', 1), ''), 'Você')`, `on conflict do nothing` pelo índice parcial) → `select public.ensure_pf_profiles();` → `add column profile_id` (nullable) nas 6 tabelas → `update … set profile_id = pf_profile_id(user_id) where profile_id is null` → `alter column profile_id set not null` → índices → `fill_default_profile()` + triggers `trg_fill_default_profile` `before insert` nas 6 tabelas.

`ensure_pf_profiles()` é `security definer`, `set search_path = public`, com `revoke execute … from public, anon, authenticated` (só migration/trigger usam).

Trigger name order: o `fill_default_profile` precisa rodar **antes** dos triggers de validação. Postgres executa triggers `before` em ordem alfabética: nomear `trg_00_fill_default_profile`.

- [ ] **Step 4: Ensaiar migration + testes**

Run: `begin; <migration>; <testes>; rollback;` via `execute_sql`.
Expected: `[{"result":"ALL PASSED"}]`.

- [ ] **Step 5: Escrever `scripts/db-dry-run.md`** (≤ 15 linhas): o comando de ensaio acima, o aviso de nunca rodar migration sem `begin/rollback` antes, e o passo de renomear o arquivo após `apply_migration`.

- [ ] **Step 6: Commit (sem push — nada foi aplicado ainda)**

```bash
git add supabase/migrations/2026112500XXXX_financial_profiles.sql supabase/tests/phase1_financial_profiles.test.sql scripts/db-dry-run.md
git commit -m "feat(db): perfis financeiros — tabela, profile_id e backfill (ensaio)"
```

---

### Task 2: Integridade entre perfis e signup criando o PF

**Files:**
- Modify: `supabase/migrations/2026112500XXXX_financial_profiles.sql` (acrescentar ao final)
- Modify: `supabase/tests/phase1_financial_profiles.test.sql`

**Interfaces:**
- Consumes: `financial_profiles`, `pf_profile_id`, `ensure_pf_profiles` (Task 1).
- Produces:
  - `public.handle_new_user()` (create or replace, mantém `security definer` e o `revoke` da migration `20261125154410`): além do insert em `profiles`, insere o PF em `financial_profiles` com nome `coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), nullif(split_part(new.email, '@', 1), ''), 'Você')`.
  - `public.validate_profile_relations()` trigger `before insert or update` em `transactions`, `budgets`, `recurring_transactions`, `categories`, `monthly_balances`, `imports` (nome `trg_10_validate_profile_relations`):
    - perfil existe e `profile.user_id = new.user_id` → senão `'Perfil inválido para este usuário'`;
    - em insert, perfil não arquivado → senão `'Este perfil está arquivado'`;
    - se a tabela tem `category_id` e ele não é nulo: `category.profile_id = new.profile_id` → senão `'A categoria pertence a outro perfil'`;
    - em `categories`, `update` que muda `profile_id` → `'Não é possível mover uma categoria para outro perfil'`.
  - `public.protect_pf_profile()` trigger `before update or delete` em `financial_profiles`: PF não pode ser apagado, arquivado, nem ter `kind` alterado → `'O perfil pessoal (PF) não pode ser removido ou arquivado'`.
  - `generate_recurring_transactions` (create or replace, mesma assinatura e corpo) passa `profile_id = v_rule.profile_id` nos três `insert`.

- [ ] **Step 1: Acrescentar os testes da Task 2** (antes do `select 'ALL PASSED'`), removendo a chamada temporária a `ensure_pf_profiles()` após o insert dos usuários sintéticos

```sql
-- t02_signup_cria_pf
do $$ begin
  if (select name from financial_profiles where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and kind = 'pf') <> 'Ana Teste'
  then raise exception 't02_signup_cria_pf: nome do full_name'; end if;
  if (select name from financial_profiles where user_id = 'aaaaaaaa-0000-0000-0000-000000000002' and kind = 'pf') <> 'pf-test-b'
  then raise exception 't02_signup_cria_pf: nome do e-mail'; end if;
end $$;

-- t05_um_pf_por_usuario
do $$ begin
  begin
    insert into financial_profiles (user_id, kind, name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'pf', 'Outro PF');
    raise exception 't05_um_pf_por_usuario: aceitou segundo PF';
  exception when unique_violation then null; end;
end $$;

-- t06_*: perfil de outro usuário e categoria de outro perfil
do $$ declare v_pj uuid; v_cat_pf uuid; begin
  insert into financial_profiles (user_id, kind, name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'pj', 'Empresa Teste') returning id into v_pj;
  select id into v_cat_pf from categories where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and name = 'Teste Cat';
  begin
    insert into transactions (user_id, profile_id, occurred_on, amount, kind, description)
      values ('aaaaaaaa-0000-0000-0000-000000000002', v_pj, '2026-01-10', 1, 'despesa', 'x');
    raise exception 't06_perfil_de_outro_usuario: aceitou';
  exception when sqlstate '23514' then null; end;
  begin
    insert into transactions (user_id, profile_id, occurred_on, amount, kind, description, category_id)
      values ('aaaaaaaa-0000-0000-0000-000000000001', v_pj, '2026-01-10', 1, 'despesa', 'x', v_cat_pf);
    raise exception 't06_categoria_de_outro_perfil: aceitou';
  exception when sqlstate '23514' then null; end;
  begin
    update categories set profile_id = v_pj where id = v_cat_pf;
    raise exception 't06_mover_categoria: aceitou';
  exception when sqlstate '23514' then null; end;
end $$;

-- t07_protege_pf
do $$ declare v_pf uuid := pf_profile_id('aaaaaaaa-0000-0000-0000-000000000002'); begin
  begin update financial_profiles set archived = true where id = v_pf; raise exception 't07_arquivar_pf: aceitou';
  exception when sqlstate '23514' then null; end;
  begin delete from financial_profiles where id = v_pf; raise exception 't07_apagar_pf: aceitou';
  exception when sqlstate '23514' then null; end;
end $$;

-- t08_rls: usuário B não vê perfis de A (pulado se não puder trocar de role)
do $$ begin
  begin
    perform set_config('request.jwt.claims', json_build_object('sub','aaaaaaaa-0000-0000-0000-000000000002','role','authenticated')::text, true);
    execute 'set local role authenticated';
    if exists (select 1 from financial_profiles where user_id = 'aaaaaaaa-0000-0000-0000-000000000001')
    then raise exception 't08_rls: B enxerga perfis de A'; end if;
    execute 'reset role';
  exception when insufficient_privilege then raise notice 't08_rls: pulado (sem permissão para set role)'; end;
end $$;

-- t10_recorrencia_copia_perfil
do $$ declare v_pj uuid; v_rule uuid; begin
  select id into v_pj from financial_profiles where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and kind = 'pj';
  insert into recurring_transactions (user_id, profile_id, name, kind, amount, frequency, day_of_month, starts_on)
    values ('aaaaaaaa-0000-0000-0000-000000000001', v_pj, 'Aluguel sala', 'despesa', 900, 'monthly', 5, '2026-01-01') returning id into v_rule;
  perform set_config('request.jwt.claims', json_build_object('sub','aaaaaaaa-0000-0000-0000-000000000001','role','authenticated')::text, true);
  perform generate_recurring_transactions(2026, 2, false);
  if (select profile_id from transactions where recurring_rule_id = v_rule) is distinct from v_pj
  then raise exception 't10_recorrencia_copia_perfil'; end if;
end $$;
```

- [ ] **Step 2: Ensaiar e ver os novos testes falharem**

Run: `begin; <migration atual>; <testes>; rollback;`
Expected: erro em `t02_signup_cria_pf` (PF não é criado no signup).

- [ ] **Step 3: Implementar `handle_new_user`, `validate_profile_relations`, `protect_pf_profile` e o `generate_recurring_transactions` com `profile_id`** no final da migration (assinaturas e mensagens nos Interfaces acima). Em `validate_profile_relations`, acessar `category_id` só quando `tg_table_name in ('transactions','budgets','recurring_transactions')` (usar `to_jsonb(new)->>'category_id'` para não quebrar nas tabelas sem a coluna). `revoke execute … from public, anon, authenticated` de `handle_new_user` de novo após o `create or replace`.

- [ ] **Step 4: Ensaiar migration + testes**

Expected: `ALL PASSED` (um `NOTICE` de `t08_rls` pulado é aceitável; registrar no commit se ocorrer).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026112500XXXX_financial_profiles.sql supabase/tests/phase1_financial_profiles.test.sql
git commit -m "feat(db): integridade entre perfis e PF criado no signup (ensaio)"
```

---

### Task 3: Resumo mensal por perfil

**Files:**
- Modify: `supabase/migrations/2026112500XXXX_financial_profiles.sql`
- Modify: `supabase/tests/phase1_financial_profiles.test.sql`

**Interfaces:**
- Consumes: `financial_profiles`, `profile_id` em `transactions` e `monthly_balances`.
- Produces:
  - `public.get_monthly_financial_summary(target_year int, target_month int, target_profile uuid) returns table (month date, saldo_inicial numeric, total_receita numeric, total_despesa numeric, resultado_operacional numeric, total_aportes numeric, disponivel_antes_aportes numeric, saldo_final numeric, transactions_count bigint)` — **mesmas colunas e ordem** da versão atual. `language sql stable security invoker set search_path = public`; `grant execute … to authenticated`, `revoke … from public, anon`.
    - `target_profile` não nulo: só aquele perfil (que precisa ser do `auth.uid()`; caso contrário devolve zeros, pois RLS já filtra).
    - `target_profile` nulo: consolidado = **soma, perfil a perfil**, do cálculo individual (cada perfil com sua própria âncora em `monthly_balances` filtrada por `profile_id`).
  - `public.get_monthly_financial_summary(target_year int, target_month int)` (versão atual, mesma assinatura) passa a ser `select * from get_monthly_financial_summary(target_year, target_month, null::uuid)`. O app não muda.

Algoritmo (não determinado só pela assinatura): reaproveitar o corpo atual da função (migration `20260822000002`, linhas 204–304) transformando-o num cálculo por perfil — `from financial_profiles fp where fp.user_id = auth.uid() and (target_profile is null or fp.id = target_profile)` com `cross join lateral` para âncora/abertura/totais filtrando `t.profile_id = fp.id` e `mb.profile_id = fp.id` — e somar as colunas numéricas no `select` final (`month` = início do mês; `transactions_count` = soma).

- [ ] **Step 1: Acrescentar os testes da Task 3**

```sql
-- Dados conhecidos para o usuário A (PF + PJ "Empresa Teste" criada em t06), mês 2026-03.
do $$ declare v_pf uuid := pf_profile_id('aaaaaaaa-0000-0000-0000-000000000001'); v_pj uuid; begin
  select id into v_pj from financial_profiles where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and kind = 'pj';
  update monthly_balances set opening_balance = 0 where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  delete from transactions where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  insert into transactions (user_id, profile_id, occurred_on, amount, kind, description) values
    ('aaaaaaaa-0000-0000-0000-000000000001', v_pf, '2026-03-05', 1000, 'receita', 'sal'),
    ('aaaaaaaa-0000-0000-0000-000000000001', v_pf, '2026-03-06', 300, 'despesa', 'mercado'),
    ('aaaaaaaa-0000-0000-0000-000000000001', v_pf, '2026-03-07', 100, 'reserva', 'aporte'),
    ('aaaaaaaa-0000-0000-0000-000000000001', v_pj, '2026-03-08', 200, 'receita', 'venda');
end $$;

-- t09_resumo_por_perfil (como usuário A)
select set_config('request.jwt.claims', json_build_object('sub','aaaaaaaa-0000-0000-0000-000000000001','role','authenticated')::text, true);
do $$ declare v_pf uuid := pf_profile_id('aaaaaaaa-0000-0000-0000-000000000001'); v_pj uuid; r record; begin
  select id into v_pj from financial_profiles where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and kind = 'pj';
  select * into r from get_monthly_financial_summary(2026, 3, v_pf);
  if (r.total_receita, r.total_despesa, r.total_aportes, r.saldo_final) <> (1000, 300, 100, 600) then raise exception 't09_pf: %', r; end if;
  select * into r from get_monthly_financial_summary(2026, 3, v_pj);
  if (r.total_receita, r.saldo_final) <> (200, 200) then raise exception 't09_pj: %', r; end if;
  select * into r from get_monthly_financial_summary(2026, 3, null::uuid);
  if (r.total_receita, r.saldo_final, r.transactions_count) <> (1200, 800, 4) then raise exception 't09_consolidado: %', r; end if;
  select * into r from get_monthly_financial_summary(2026, 4);
  if r.saldo_inicial <> 800 then raise exception 't09_abril_herda_saldo: %', r; end if;
end $$;
```

E o teste de não-regressão com dados reais, que precisa capturar o resultado **antes** da migration. Ele vai num arquivo separado `supabase/tests/phase1_regression_snapshot.sql` com um marcador `-- <migration aqui>`; para rodar, substituir o marcador pelo conteúdo da migration e executar tudo entre `begin;` e `rollback;`. Expected: `REGRESSION OK`.

```sql
-- Captura em laço explícito: o "usuário logado" (claims) precisa ser trocado
-- ANTES de cada chamada; set_config dentro de um JOIN não tem ordem garantida.
create or replace function pg_temp.snapshot_summaries(target regclass) returns void language plpgsql as $$
declare u uuid; ym record;
begin
  for u in select distinct user_id from public.transactions loop
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    for ym in select * from (values (2026,9),(2026,10),(2026,11)) v(y, m) loop
      execute format('insert into %s select %L::uuid, %s, %s, s.* from public.get_monthly_financial_summary(%s, %s) s',
                     target, u, ym.y, ym.m, ym.y, ym.m);
    end loop;
  end loop;
end $$;

-- antes da migration
create temp table snap_before (user_id uuid, y int, m int, month date, saldo_inicial numeric, total_receita numeric,
  total_despesa numeric, resultado_operacional numeric, total_aportes numeric, disponivel_antes_aportes numeric,
  saldo_final numeric, transactions_count bigint);
select pg_temp.snapshot_summaries('snap_before');

-- <migration aqui>

-- depois da migration
create temp table snap_after (like snap_before);
select pg_temp.snapshot_summaries('snap_after');
do $$ begin
  if (select count(*) from snap_before) = 0 then raise exception 't09_resumo_identico_producao: snapshot vazio'; end if;
  if exists (select * from snap_before except select * from snap_after)
     or exists (select * from snap_after except select * from snap_before)
  then raise exception 't09_resumo_identico_producao: números mudaram'; end if;
end $$;
select 'REGRESSION OK' as result;
```

- [ ] **Step 2: Ensaiar e ver falhar**

Expected: erro `function get_monthly_financial_summary(integer, integer, uuid) does not exist`.

- [ ] **Step 3: Implementar as duas funções** (Interfaces acima) no final da migration.

- [ ] **Step 4: Ensaiar migration + testes e o snapshot de regressão**

Expected: `ALL PASSED` no ensaio dos testes e `REGRESSION OK` no snapshot.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026112500XXXX_financial_profiles.sql supabase/tests/
git commit -m "feat(db): resumo mensal por perfil e consolidado (ensaio)"
```

---

### Task 4: Aplicar em produção, tipos do app e verificação ponta a ponta

**Files:**
- Modify: `src/types/database.ts`
- Rename: `supabase/migrations/2026112500XXXX_financial_profiles.sql` → versão registrada
- Test: `e2e/` (existentes, sem mudança)

**Interfaces:**
- Consumes: tudo das Tasks 1–3.
- Produces (TypeScript, para as fases 2–4):
  - `Database['public']['Tables']['financial_profiles']` com `Row`/`Insert`/`Update` (`Insert.profile_id` opcional nas demais tabelas — o banco preenche).
  - `profile_id: string` em `Row` de `transactions`, `categories`, `monthly_balances`, `imports`; `profile_id?: string` em `Insert`/`Update`.
  - `export type ProfileKind = 'pf' | 'pj'` e `export type FinancialProfile = Database['public']['Tables']['financial_profiles']['Row']`.
  - Em `Functions`: `get_monthly_financial_summary` aceitando `{ target_year: number; target_month: number; target_profile?: string | null }`.

- [ ] **Step 1: Último ensaio completo** (migration + testes + snapshot de regressão). Expected: `ALL PASSED` e `REGRESSION OK`. Anotar `select count(*) from transactions` para o Step 3.

- [ ] **Step 2: Aplicar** com `mcp__plugin_supabase_supabase__apply_migration` (name `financial_profiles`, query = arquivo da migration).
Expected: `{"success":true}`.

- [ ] **Step 3: Verificar produção (somente leitura)**

```sql
select
  (select count(*) from auth.users) as users,
  (select count(*) from financial_profiles where kind = 'pf') as pf_profiles,
  (select count(*) from transactions where profile_id is null) as tx_sem_perfil,
  (select count(*) from categories where profile_id is null) as cat_sem_perfil,
  (select count(*) from transactions) as tx_total;
```
Expected: `users = pf_profiles`, `tx_sem_perfil = 0`, `cat_sem_perfil = 0`, `tx_total` igual ao valor antes (anotar no Step 1; 172 em 2026-11-25 + o que houver entrado).

- [ ] **Step 4: Rodar os testes SQL de novo contra o banco já migrado** (`begin; <testes>; rollback;`). Expected: `ALL PASSED`.

- [ ] **Step 5: Advisors** — `get_advisors` `security` e `performance`. Expected: nenhum aviso novo citando `financial_profiles`, `pf_profile_id`, `fill_default_profile`, `validate_profile_relations` ou `protect_pf_profile` (os 2 avisos já conhecidos podem continuar).

- [ ] **Step 6: Renomear o arquivo da migration** para a versão de `list_migrations`.

- [ ] **Step 7: Atualizar `src/types/database.ts`** (Interfaces acima) e rodar `npm run check`. Expected: typecheck, lint e 45+ testes Vitest verdes.

- [ ] **Step 8: Build e e2e local** — `npm run build` e `npm run test:e2e` (com `E2E_EMAIL`/`E2E_PASSWORD` no ambiente). Expected: build ok; 12/12 e2e passam (o app cria/edita/apaga/importa sem enviar `profile_id`).

- [ ] **Step 9: Commit e push**

```bash
git add -A supabase/ src/types/database.ts docs/
git commit -m "feat: fase 1 PF+PJ — perfis financeiros no banco (app inalterado)"
git push origin main
```

- [ ] **Step 10: Verificar produção na Vercel** — aguardar o deploy `READY` e rodar `E2E_BASE_URL=https://valoria-azadi.vercel.app npm run test:e2e`. Expected: 12/12.

---

## Self-review (feito)

- **Cobertura do spec (fase 1):** tabela de perfis ✔ T1; um PF por usuário + signup ✔ T1/T2; `profile_id` nas 6 tabelas + backfill ✔ T1; integridade (dono, categoria×perfil, PF protegido) ✔ T2; resumo com perfil opcional mantendo a assinatura antiga ✔ T3; app idêntico ✔ T4 (e2e). Unique de categorias/saldos, transferências e telas: fases 2–3 por decisão registrada em Global Constraints.
- **Tipos/nomes consistentes:** `pf_profile_id`, `ensure_pf_profiles`, `fill_default_profile`, `validate_profile_relations`, `protect_pf_profile`, `trg_00_*`/`trg_10_*` usados igual em todas as tasks.
- **Review Focus:** os 5 itens têm teste na task dona (t01 fallback, t03/e2e, t04, t06, t09 regressão).
