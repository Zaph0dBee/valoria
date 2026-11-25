# PF + PJ — Fase 3 (Transferências entre perfis) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pró-labore, distribuição de lucros e aporte de capital são lançados **uma vez** entre dois perfis e cada visão (empresa, PF, consolidado) os conta do jeito definido no spec.

**Architecture:** Novo tipo de lançamento `transferencia` com `counterpart_profile_id` (destino) e `transfer_reason`. O lançamento pertence ao perfil de origem (`profile_id`); o destino o enxerga por `counterpart_profile_id`. O resumo mensal ganha colunas de transferência e a regra de cada motivo; a tela de lançamentos ganha o tipo "Transferência"; a importação permite marcar linhas como transferência e não duplica a mesma transferência vinda dos dois extratos.

**Tech Stack:** Postgres 17 / Supabase (MCP), Next.js 16, Zod, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-25-pf-pj-perfis-design.md` — seções "Transferência entre perfis", "Transferência vinda dos dois extratos", "Outras decisões". Fases anteriores: planos `2026-11-25-pf-pj-fase1-fundacao.md` e `2026-11-25-pf-pj-fase2-empresas-seletor.md`.

## Global Constraints

- Projeto Supabase `tgtsfodmdoclscklhglz`, 27 usuários reais. Toda migration é ensaiada em `begin … rollback` (com snapshot de regressão do painel) antes do `apply_migration`; renomear arquivo para a versão registrada e conferir md5 (sem `\r`).
- **Regras do spec (literal):**

| motivo | na empresa (origem) | na PF (destino) | consolidado |
|---|---|---|---|
| `pro_labore` | **custo**: reduz o resultado | **entrada**, entra na base NCE | não conta |
| `lucros` | **não é custo** ("Lucros distribuídos", abaixo do resultado) | **entrada**, base NCE | não conta |
| `aporte_capital` (PF → PJ) | entrada de capital (não é faturamento) | saída ("Aporte na empresa", não é despesa de vida) | não conta |
| `outro` | saída sem efeito no resultado | entrada | não conta |

- Direções obrigatórias: `pro_labore` e `lucros` = PJ → PF; `aporte_capital` = PF → PJ; `outro` = qualquer par de perfis diferentes do mesmo usuário.
- Transferência **não tem categoria nem meta** (`category_id`, `subcategory_id`, `reserve_id` nulos).
- Saldo do perfil: `saldo_inicial + receitas − despesas − aportes − transf. enviadas + transf. recebidas`. Consolidado: transferências não entram em receitas/despesas/resultado (e se anulam no saldo).
- Rótulos (spec): na PF, `"Pró-labore · <Empresa>"`, `"Lucros · <Empresa>"`; na empresa, `"Pró-labore → Você (PF)"` etc.
- Tipo "Transferência" só aparece com 2+ perfis ativos (quem só tem PF não vê nada novo).
- Dedupe de import (spec): linha marcada como transferência que casa com transferência existente entre **os mesmos dois perfis, mesmo valor, data com até 3 dias de diferença** é mostrada como "já registrada" e pulada. Direção: linha de **entrada** → o perfil escolhido na linha é a **origem**; linha de **saída** → é o **destino**.
- `ALTER TYPE … ADD VALUE` não pode ser usado na mesma transação em que o valor é adicionado: a migration do enum vai **separada e antes** (é compatível com o app publicado: nenhuma linha usa o valor).

## Review Focus

1. **Transferência editada/apagada** → as duas visões (origem e destino) se atualizam juntas, pois é uma linha só. Teste e2e `apagar transferência some dos dois perfis` (Task 4).
2. **Empresa arquivada como destino/origem** → não aceita transferência nova (regra de perfil arquivado da fase 2 vale também para `counterpart_profile_id`). Teste SQL `t3_05_contraparte_arquivada` (Task 2).
3. **Saldo inicial do mês seguinte** herda transferências do mês anterior em cada perfil. Teste SQL `t3_04_saldo_herda_transferencias` (Task 2).
4. **Mesma transferência importada nos dois extratos** (saída na empresa dia 05, entrada na PF dia 07) → só uma. Teste Vitest `matchExistingTransfers` (Task 5) + e2e (Task 5).
5. **Painel PF de quem vive de pró-labore** → "Entradas" e base da distribuição Valoria incluem o pró-labore recebido; consolidado não duplica. Teste e2e `pró-labore aparece na PF e não duplica no consolidado` (Task 3).

---

## File Structure

| arquivo | responsabilidade |
|---|---|
| `supabase/migrations/<v>_transfer_kind.sql` | só `alter type transaction_kind add value 'transferencia'` + checks que impedem o valor em `categories`/`recurring_transactions` |
| `supabase/migrations/<v>_transfers.sql` | enum `transfer_reason`, colunas, check de forma, validações no trigger, resumo mensal com transferências |
| `supabase/tests/phase3_transfers.test.sql` | testes SQL |
| `src/lib/transfers.ts` (+ `.test.ts`) | regras puras: rótulo/sinal na visão, direção válida por motivo, dedupe de import |
| modificar: `src/types/database.ts`, `src/actions/transactions.ts`, `src/app/(app)/transacoes/{page,transactions-client}.tsx`, `src/app/(app)/dashboard/page.tsx`, `src/components/dashboard/month-summary.tsx`, `src/components/dashboard/recent-transactions.tsx`, `src/actions/imports.ts`, `src/app/(app)/importar/{page,import-client}.tsx`, `e2e/companies.spec.ts` |

---

### Task 1: Enum `transferencia` (migration separada)

**Files:** Create `supabase/migrations/2026112600AAAA_transfer_kind.sql`

**Interfaces:**
- Produces: valor `'transferencia'` em `public.transaction_kind`; `alter table categories add constraint categories_kind_not_transfer check (kind <> 'transferencia')`; o mesmo em `recurring_transactions` (`recurring_transactions_kind_not_transfer`) e em `budgets` não se aplica (sem `kind`).

- [ ] **Step 1: RED** — `begin; insert into public.categories (user_id, name, kind) select id, 'x', 'transferencia' from auth.users limit 1; rollback;` → erro `invalid input value for enum transaction_kind`.
- [ ] **Step 2:** Escrever a migration. `add value if not exists` (idempotente). As duas constraints vão numa **segunda** migration pequena? Não: constraints que *comparam* com o valor novo também não podem rodar na mesma transação → usar `check (kind::text <> 'transferencia')` (comparação por texto, válida na mesma transação).
- [ ] **Step 3:** Ensaiar não é possível para `add value` dentro de `begin/rollback` em todas as versões — aplicar direto (é aditivo e compatível). Verificar com `select enum_range(null::transaction_kind)` → contém `transferencia`; e o insert do Step 1 agora falha por `categories_kind_not_transfer` (GREEN).
- [ ] **Step 4:** Renomear arquivo para a versão registrada, md5, commit.

---

### Task 2: Banco — transferências e resumo mensal

**Files:** Create `supabase/migrations/2026112600BBBB_transfers.sql`, `supabase/tests/phase3_transfers.test.sql`

**Interfaces:**
- Produces:
  - `create type public.transfer_reason as enum ('pro_labore', 'lucros', 'aporte_capital', 'outro')`.
  - `transactions.counterpart_profile_id uuid references financial_profiles(id) on delete no action` e `transactions.transfer_reason public.transfer_reason`; índice `(counterpart_profile_id, occurred_on desc) where counterpart_profile_id is not null`.
  - Check `transactions_transfer_shape`: `kind = 'transferencia'` ⇔ (`counterpart_profile_id` e `transfer_reason` não nulos, `category_id`, `subcategory_id`, `reserve_id` nulos, `counterpart_profile_id <> profile_id`).
  - `validate_profile_relations` (create or replace; manter tudo da fase 2) ganha, para `transactions` com `kind = 'transferencia'`: contraparte do mesmo usuário (`'Perfil de destino inválido'`), não arquivada em insert ou quando muda (`'O perfil de destino está arquivado'`), e direção por motivo (`'Pró-labore e lucros vão da empresa para a PF'`, `'Aporte de capital vai da PF para a empresa'`). Todas 23514.
  - `get_monthly_financial_summary(int, int, uuid)` e a de 2 argumentos: **`drop function` + `create`** (o tipo de retorno muda), mantendo as colunas atuais e **acrescentando no fim**: `transf_recebidas numeric`, `transf_enviadas numeric`, `entradas_transferidas numeric` (recebidas com motivo `pro_labore`, `lucros`, `outro`), `pro_labore_pago numeric`, `lucros_distribuidos numeric`. Regras:
    - por perfil `P`: enviadas = `transferencia` com `profile_id = P`; recebidas = com `counterpart_profile_id = P`.
    - `resultado_operacional = receita + entradas_transferidas − despesa − pro_labore_pago`.
    - `disponivel_antes_aportes = saldo_inicial + receita − despesa + transf_recebidas − transf_enviadas`; `saldo_final = disponivel_antes_aportes − aportes`.
    - saldo inicial (âncora e acumulado antes do mês) inclui `+recebidas −enviadas` do perfil.
    - **consolidado** (`target_profile is null`): soma dos perfis para saldos; `transf_*`, `entradas_transferidas`, `pro_labore_pago`, `lucros_distribuidos` = 0 e `resultado_operacional = receita − despesa`.
    - `grant execute … to authenticated`, `revoke … from public, anon` nas duas assinaturas.

- [ ] **Step 1: Testes SQL** (`phase3_transfers.test.sql`, usuário sintético `cccccccc-…-0001` com PF + PJ "Loja"):

| teste | cenário | asserção |
|---|---|---|
| `t3_01_forma` | transferência com categoria / sem motivo / contraparte = origem | 23514 ou check violation |
| `t3_02_direcao` | pró-labore PF→PJ; aporte de capital PJ→PF | 23514 |
| `t3_03_resumo` | março/2026: PJ receita 10.000, despesa 2.000, pró-labore PJ→PF 3.000, lucros PJ→PF 4.000; PF despesa 1.500, aporte de capital PF→PJ 500 | **PJ**: receita 10000, resultado 5000 (10000−2000−3000), transf_enviadas 7000, transf_recebidas 500, saldo_final 1500 (10000−2000−7000+500). **PF**: receita 0, entradas_transferidas 7000, resultado 5500 (7000−1500), transf_recebidas 7000, transf_enviadas 500, saldo_final 5000. **Consolidado**: receita 10000, despesa 3500, resultado 6500, transf_* 0, saldo_final 6500 |
| `t3_04_saldo_herda_transferencias` | abril/2026 sem lançamentos | `saldo_inicial` abril: PJ 1500, PF 5000, consolidado 6500 |
| `t3_05_contraparte_arquivada` | arquivar PJ e tentar pró-labore novo PJ→PF e "outro" PF→PJ | 23514 |
| `t3_06_categoria_proibida` | categoria `kind='transferencia'` | violação de `categories_kind_not_transfer` |

  E o snapshot de regressão (`phase1_regression_snapshot.sql`), comparando **só as colunas antigas** (as 9 primeiras): idêntico para todos os usuários.
- [ ] **Step 2: RED** (sem migration): `column "counterpart_profile_id" does not exist`.
- [ ] **Step 3:** Migration.
- [ ] **Step 4: GREEN** — `ALL PASSED` + `REGRESSION OK` + testes das fases 1 e 2 que tocam o resumo (`t09`, `t2_04`, `t2_09`).
- [ ] **Step 5:** Aplicar (compatível: o app publicado lê as colunas antigas pelo nome; nenhuma transferência existe). Renomear, md5, advisors, testes no banco migrado. Atualizar `src/types/database.ts` (`TransactionKind` com `'transferencia'`, `TransferReason`, colunas novas, retorno do RPC). `npm run check`. Commit.

---

### Task 3: Painel com transferências

**Files:** Modify `src/components/dashboard/month-summary.tsx`, `src/app/(app)/dashboard/page.tsx`, `src/components/dashboard/recent-transactions.tsx`, `src/components/dashboard/nce-distribution.tsx` (só a base), `src/lib/transfers.ts` (+ test)

**Interfaces:**
- Produces (`src/lib/transfers.ts`):
  - `export type TransferReason = 'pro_labore' | 'lucros' | 'aporte_capital' | 'outro'`
  - `export const TRANSFER_REASON_LABELS: Record<TransferReason, string>` = `{ pro_labore: 'Pró-labore', lucros: 'Lucros', aporte_capital: 'Aporte de capital', outro: 'Transferência' }`
  - `transferView(tx: { profile_id: string; counterpart_profile_id: string; transfer_reason: TransferReason; amount: number }, viewProfileId: string | null, names: Record<string, string>): { sign: 1 | -1 | 0; label: string }` — origem: `sign -1`, `label "<Motivo> → <destino>"`; destino: `sign 1`, `label "<Motivo> · <origem>"`; consolidado (`null`): `sign 0`, `label "<Motivo>: <origem> → <destino>"`.

- [ ] **Step 1:** Vitest `transfers.test.ts`: pró-labore visto da empresa → `{ sign: -1, label: 'Pró-labore → Você (PF)' }`; da PF → `{ sign: 1, label: 'Pró-labore · Loja' }`; consolidado → `{ sign: 0, label: 'Pró-labore: Loja → Você (PF)' }`. E2e (em `companies.spec.ts`) **`pró-labore aparece na PF e não duplica no consolidado`**: na empresa, criar receita 10.000 e transferência pró-labore 3.000 para a PF (via Task 4 — este e2e é escrito aqui e fica RED até a Task 4); PF: "entradas" mostra `R$ 3.000,00`; empresa: "resultado" `R$ 7.000,00`; consolidado: "entradas" `R$ 10.000,00`.
- [ ] **Step 2: RED** (Vitest: módulo inexistente).
- [ ] **Step 3:** Implementar `transfers.ts`; painel: "entradas" = `total_receita + entradas_transferidas`; base da distribuição Valoria (PF) = a mesma soma; quando houver transferências, uma linha "Transferências" no resumo com `+recebidas / −enviadas` (oculta no consolidado); últimos lançamentos usam `transferView` (sinal e rótulo). Consulta de últimos lançamentos no modo perfil: `profile_id.eq.X,counterpart_profile_id.eq.X` (`.or(...)`).
- [ ] **Step 4: GREEN** Vitest; o e2e fica pendente da Task 4 (registrar no ledger).
- [ ] **Step 5:** Commit (local).

---

### Task 4: Lançamentos — tipo Transferência

**Files:** Modify `src/actions/transactions.ts`, `src/app/(app)/transacoes/page.tsx`, `src/app/(app)/transacoes/transactions-client.tsx`

**Interfaces:**
- Consumes: `transferView`, `TRANSFER_REASON_LABELS` (Task 3).
- Produces: `TransactionSchema` aceita `kind: 'transferencia'` com `counterpart_profile_id: uuid` e `transfer_reason`; para transferência o action força `category_id/subcategory_id/reserve_id = null` e valida direção (mesmas mensagens do banco).

- [ ] **Step 1: E2e** `transferência pró-labore` (na empresa: Novo lançamento → tipo `Transferência` → Motivo `Pró-labore` → Para `Você (PF)` → 3.000,00 → salvar; a linha aparece na empresa com `−R$ 3.000,00` e rótulo `Pró-labore → Você (PF)`; na PF aparece com `+R$ 3.000,00` e `Pró-labore · <empresa>`) e `apagar transferência some dos dois perfis`.
- [ ] **Step 2: RED.**
- [ ] **Step 3:** Lista no modo perfil com `.or('profile_id.eq.X,counterpart_profile_id.eq.X')`; sinal/rótulo via `transferView`; formulário: botão de tipo `Transferência` (só com 2+ perfis ativos), campos `Motivo` (select com `aria-label="Motivo"`) e `Para` (`aria-label="Para"`, perfis ativos ≠ origem); ao escolher motivo, sugerir origem/destino válidos (pró-labore/lucros: origem = empresa ativa, destino = PF; aporte de capital: origem PF, destino = empresa); sem campos de categoria/meta.
- [ ] **Step 4: GREEN** — e2e desta task + o e2e pendente da Task 3 + suíte completa.
- [ ] **Step 5:** Commit (local).

---

### Task 5: Importar com transferência e dedupe entre extratos

**Files:** Modify `src/lib/transfers.ts` (+ test), `src/actions/imports.ts`, `src/app/(app)/importar/import-client.tsx`

**Interfaces:**
- Produces:
  - `ParsedRow` ganha opcionais `transfer_profile_id?: string | null` (o **outro** perfil) e `transfer_reason?: TransferReason | null`; `kind` pode ser `'transferencia'`, e a linha guarda `direction: 'in' | 'out'` (a partir do sinal original do extrato — `receita` ⇒ `in`, `despesa` ⇒ `out`, definida no parse e mantida ao trocar o tipo).
  - `resolveTransferRow(row, importProfileId): { profile_id: string; counterpart_profile_id: string }` — `in` ⇒ origem = `transfer_profile_id`, destino = perfil do import; `out` ⇒ origem = perfil do import, destino = `transfer_profile_id`.
  - `matchExistingTransfers<T extends { occurred_on: string; amount: number; profile_id: string; counterpart_profile_id: string }>(rows: T[], existing: T[], toleranceDays = 3): { fresh: T[]; already: T[] }` — mesmo par (origem, destino), mesmo valor em centavos, `|data| ≤ 3 dias`; cada existente casa no máximo uma linha.

- [ ] **Step 1:** Vitest: saída na empresa dia 05 e entrada na PF dia 07, mesmo valor → `already`; dia 09 (4 dias) → `fresh`; valor diferente → `fresh`; par invertido → `fresh`; dois iguais no arquivo e um existente → 1 fresh + 1 already. E2e `mesma transferência nos dois extratos`: importar na empresa uma saída `-3.000,00` marcada como Transferência/Pró-labore para PF; importar na PF a entrada `3.000,00` dois dias depois marcada como Transferência/Pró-labore da empresa → aviso "1 já registrada" e nenhum lançamento novo.
- [ ] **Step 2: RED.**
- [ ] **Step 3:** Na revisão do import, o select de tipo ganha `Transferência` (só com 2+ perfis); ao escolher, aparecem `Outro perfil` e `Motivo` na linha; o action resolve origem/destino com `resolveTransferRow`, valida direção, consulta transferências existentes do par no intervalo de datas e pula as "já registradas" (contadas em `skipped`), além do dedupe normal das demais linhas.
- [ ] **Step 4: GREEN** (Vitest + e2e + suíte).
- [ ] **Step 5:** Commit (local).

---

### Task 6: Revisão final e publicação

- [ ] **Step 1:** Revisão independente (modelo mais capaz) só do código do app (SQL já ensaiado e aplicado na Task 2), com o Review Focus acima.
- [ ] **Step 2:** Correções Critical/Important com teste RED→GREEN.
- [ ] **Step 3:** `npm run check`, `npm run build`, `npm run test:e2e` local → push `main` → deploy `READY` → e2e em produção.
- [ ] **Step 4:** Verificação read-only: 0 empresas/lançamentos `e2e-`; nenhuma transferência com contraparte de outro usuário (`join financial_profiles` por `counterpart_profile_id`).

---

## Self-review (feito)

- **Cobertura do spec (transferências):** forma e direção (T2), regras por visão incl. pró-labore custo × lucros não custo × aporte de capital (T2 `t3_03`, T3), saldo (T2 `t3_04`), rótulos com nome da empresa (T3/T4), lançar uma vez do lado da empresa (T4), dedupe entre extratos com ±3 dias e regra de direção (T5), arquivada (T2 `t3_05`). Sugestão de lucro e relatórios: fase 4.
- **Nomes consistentes:** `transfer_reason`, `counterpart_profile_id`, `entradas_transferidas`, `pro_labore_pago`, `lucros_distribuidos`, `transferView`, `resolveTransferRow`, `matchExistingTransfers`, `TRANSFER_REASON_LABELS`.
- **Review Focus:** 5 itens com teste na task dona.
