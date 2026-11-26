# PF + PJ — Fase 4 (Painel da empresa + Relatórios) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A empresa ganha um painel de empresa (faturamento, custos, impostos, pró-labore, resultado) com a sugestão "disponível para distribuir" e registro de lucro em 1 clique; e há uma página Relatórios com comparativo por perfil, evolução de 12 meses, retiradas e exportação CSV.

**Architecture:** Banco: marca `is_tax` em categorias e uma função que devolve o resumo mensal de vários meses × perfis numa chamada. App: funções puras testadas (`profitSuggestion`, `toTransactionsCsv`), o painel do perfil PJ usa os campos que o resumo já devolve, o registro de lucro reusa `createTransaction` (transferência `lucros` PJ → PF), e `/relatorios` é uma página server-side com um gráfico Recharts e um route handler para o CSV.

**Tech Stack:** Postgres/Supabase (MCP), Next.js 16 (Server Components, Route Handler), Recharts (já é dependência), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-25-pf-pj-perfis-design.md` — "Sugestão de distribuição de lucro", "Telas" (Painel PJ, Relatórios v1), "Outras decisões" (`is_tax`). Fases 1–3 em produção (planos `2026-11-25-*` e `2026-11-26-pf-pj-fase3-transferencias.md`).

## Global Constraints

- Supabase `tgtsfodmdoclscklhglz`, 27 usuários reais. Migration ensaiada em `begin … rollback` com snapshot de regressão; aplicar; renomear/md5; **logo após aplicar, rodar o e2e completo em produção** (lição do incidente da fase 3: memória `valoria-db-change-verification`).
- Todo embed de `financial_profiles` a partir de `transactions` usa `financial_profiles!transactions_profile_id_fkey(...)` (existem duas FKs).
- **Sugestão de lucro (spec, literal):** "O lucro **não é puxado automaticamente** … Confirmar cria a transferência `lucros` (Empresa → PF) com data de hoje, editável. Se o resultado for ≤ 0, o cartão mostra o valor e não sugere retirada." Disponível = `resultado_operacional − lucros_distribuidos` do mês (o resultado já desconta o pró-labore).
- **Impostos (spec):** marca `is_tax boolean` em `categories`, ligada no template ("Impostos (DAS/Simples)") e editável em qualquer categoria **da empresa**. Custos = despesas sem a marca.
- **Relatórios v1 (spec):** (1) comparativo do mês `PF | Empresa… | Consolidado` com linhas Entradas, Saídas, Resultado, Aportes, Transferências, Saldo final; (2) evolução dos últimos 12 meses do resultado por perfil (Recharts); (3) retiradas da empresa para a PF no período (pró-labore × lucros); (4) exportar CSV do período com coluna de perfil.
- Relatórios aparece **só com 2+ perfis ativos** no menu (quem só tem PF vê o app como hoje); a rota responde a todos.
- Menu mobile já tem 5 itens em 360px: "Relatórios" entra no **menu do usuário** no celular e na **barra lateral** no computador.
- CSV: UTF-8 com BOM, separador `;`, decimal com vírgula, datas `dd/mm/aaaa` (abre certo no Excel pt-BR). Colunas: `Data;Perfil;Tipo;Categoria;Subcategoria;Descrição;Valor;Destino;Motivo`. Valor com sinal na visão do perfil de origem (receita +, despesa/aporte/transferência −).
- **Gráfico:** carregar a skill `dataviz` antes de escrever o gráfico (paleta, eixos, tooltip, acessível em tema claro e escuro).

## Review Focus

1. **Empresa com resultado negativo ou zero** → cartão mostra o valor e **não** mostra o botão de registrar lucro. Teste Vitest `profitSuggestion` (Task 2) + e2e (Task 3).
2. **Lucro já distribuído no mês** → disponível diminui; se tudo já foi distribuído, sem sugestão. Teste Vitest (Task 2).
3. **CSV com descrição contendo `;`, aspas ou quebra de linha** → campo entre aspas, aspas duplicadas; Excel não quebra colunas. Teste Vitest `toTransactionsCsv` (Task 2).
4. **Relatório de quem só tem PF** (acesso direto a `/relatorios`) → mostra só PF e Consolidado sem quebrar. Teste e2e (Task 5).
5. **Marcar `is_tax` numa categoria da PF** → não permitido (só empresa). Teste SQL `t4_02` (Task 1).

---

## File Structure

| arquivo | responsabilidade |
|---|---|
| `supabase/migrations/<v>_reports_and_tax.sql` | `categories.is_tax` (+ check só em PJ), `apply_pj_template` marca Impostos, `get_monthly_summaries(start date, months int)` |
| `supabase/tests/phase4_reports.test.sql` | testes SQL |
| `src/lib/profit.ts` (+ test) | `profitSuggestion` |
| `src/lib/csv-export.ts` (+ test) | `toTransactionsCsv` |
| `src/components/dashboard/company-panel.tsx` | cartão de empresa + sugestão de lucro |
| `src/actions/profit.ts` | `registerProfitDistribution` |
| `src/app/(app)/relatorios/page.tsx`, `results-chart.tsx` | relatórios |
| `src/app/(app)/relatorios/export/route.ts` | CSV |
| modificar: `src/app/(app)/dashboard/page.tsx`, `src/app/(app)/categorias/categories-client.tsx`, `src/actions/categories.ts`, `src/components/nav.tsx`, `src/proxy.ts`, `src/types/database.ts`, `e2e/companies.spec.ts` |

---

### Task 1: Banco — `is_tax` e resumo de vários meses

**Files:** Create `supabase/migrations/<versão registrada>_reports_and_tax.sql` (renomeado após aplicar), `supabase/tests/phase4_reports.test.sql`

**Interfaces:**
- Produces:
  - `categories.is_tax boolean not null default false`; trigger próprio `validate_category_tax()` (`before insert or update of is_tax, profile_id, kind`): `is_tax = true` só em perfil `pj` com `kind = 'despesa'`, senão `'Só despesas da empresa podem ser marcadas como imposto'` (23514).
  - `apply_pj_template` (create or replace, mesmo corpo da fase 2) insere `Impostos (DAS/Simples)` com `is_tax = true`; `update categories set is_tax = true where name = 'Impostos (DAS/Simples)' and kind = 'despesa' and profile_id in (select id from financial_profiles where kind = 'pj')` (backfill; hoje 0 linhas).
  - `public.get_monthly_summaries(start_month date, months int) returns table (month date, profile_id uuid, <mesmas 14 colunas de get_monthly_financial_summary a partir de saldo_inicial>)` — `security invoker`, `stable`; para cada mês de `generate_series(start_month, start_month + (months-1) months, '1 month')` e cada perfil do `auth.uid()` (inclusive arquivados) **mais** uma linha com `profile_id = null` (consolidado), chama `get_monthly_financial_summary(ano, mês, perfil)`. `months` entre 1 e 24 (senão 22023). Grants: `authenticated`; revoke `public, anon`.
- [ ] **Step 1: Testes SQL** — `t4_01_template_marca_imposto` (empresa nova com template → `Impostos (DAS/Simples)` tem `is_tax`), `t4_02_is_tax_so_empresa` (marcar categoria da PF → 23514; despesa da PJ → ok; receita da PJ → 23514), `t4_03_varios_meses` (usuário sintético com PF + PJ, lançamentos em jan e fev/2026; `get_monthly_summaries('2026-01-01', 2)` devolve 2 meses × (2 perfis + consolidado) = 6 linhas e cada linha bate com `get_monthly_financial_summary` do mesmo mês/perfil), `t4_04_limites` (`months` 0 e 25 → 22023).
- [ ] **Step 2: RED** — `column "is_tax" does not exist`.
- [ ] **Step 3: Migration.**
- [ ] **Step 4: GREEN** — `ALL PASSED` + snapshot de regressão do painel (9 colunas) idêntico.
- [ ] **Step 5:** Aplicar; renomear; md5; advisors; **e2e completo em produção**; tipos (`categories.is_tax`, `get_monthly_summaries`); `npm run check`; commit (push só na Task 6).

---

### Task 2: Funções puras — sugestão de lucro e CSV

**Files:** Create `src/lib/profit.ts`, `src/lib/profit.test.ts`, `src/lib/csv-export.ts`, `src/lib/csv-export.test.ts`

**Interfaces:**
- Produces:
  - `profitSuggestion(s: { resultado_operacional: number; lucros_distribuidos: number }): { resultado: number; distribuido: number; disponivel: number; sugerir: boolean }` — `disponivel = max(resultado − distribuido, 0)` arredondado em centavos; `sugerir = resultado > 0 && disponivel > 0`.
  - `type CsvTransaction = { occurred_on: string; profile: string; kind: TransactionKind; category: string | null; subcategory: string | null; description: string; amount: number; counterpart: string | null; reason: TransferReason | null }`
  - `toTransactionsCsv(rows: CsvTransaction[]): string` — BOM + cabeçalho `Data;Perfil;Tipo;Categoria;Subcategoria;Descrição;Valor;Destino;Motivo` + linhas com `\r\n`; Tipo em pt-BR (`Receita`, `Despesa`, `Aporte`, `Transferência`); Motivo pelos rótulos de `TRANSFER_REASON_LABELS`; Valor `-1234,56` / `1234,56` (sem milhar, vírgula decimal).
- [ ] **Step 1: Testes** — `profitSuggestion`: (8400, 0) → disponível 8400, sugerir; (8400, 3000) → 5400; (8400, 8400) → 0, não sugerir; (−500, 0) → 0, não sugerir; (0, 0) → não sugerir; (100.005, 0) → 100.01. `toTransactionsCsv`: começa com `﻿` + cabeçalho exato; despesa 1.234,56 → `-1234,56`; receita → `1234,56`; transferência pró-labore → Tipo `Transferência`, Destino `Você (PF)`, Motivo `Pró-labore`, valor negativo; descrição `Mercado; "Extra"` → `"Mercado; ""Extra"""`; descrição com `\n` → entre aspas; data `2026-01-05` → `05/01/2026`.
- [ ] **Step 2: RED** (módulos inexistentes). **Step 3:** implementar. **Step 4: GREEN.** **Step 5:** commit.

---

### Task 3: Painel da empresa com sugestão de lucro

**Files:** Create `src/components/dashboard/company-panel.tsx`, `src/actions/profit.ts`; Modify `src/app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `profitSuggestion` (T2); `is_tax` (T1); `createTransaction` (existente; aceita transferência).
- Produces: `registerProfitDistribution(input: { profile_id: string; amount: number; occurred_on: string }): Promise<{ ok: true } | { error: string }>` — valida perfil PJ ativo do usuário, busca o PF, chama `createTransaction` com `kind: 'transferencia'`, `transfer_reason: 'lucros'`, `counterpart_profile_id: <pf>`, descrição `Lucros distribuídos · <mês/ano>`.
- `<CompanyPanel summary taxTotal profileId month year />` (client) — linhas: Faturamento (`total_receita`), Custos (`total_despesa − taxTotal`), Impostos (`taxTotal`), Pró-labore (`pro_labore_pago`), Resultado, Lucros já distribuídos; cartão "Disponível para distribuir" com botão `Registrar lucro de R$ X` (data de hoje) e `Outro valor` (abre campo com valor/data). Sem botão quando `sugerir = false`.
- [ ] **Step 1: E2e** em `companies.spec.ts` — `sugestão de lucro`: empresa com receita 8.400,00 e pró-labore 3.000,00 no **mês atual** (o botão registra com a data de hoje) → cartão mostra `Disponível para distribuir` `R$ 5.400,00`; clicar `Registrar lucro de R$ 5.400,00` → aviso `Lucro registrado`; disponível vira `R$ 0,00` e o botão some; na PF aparece entrada `Lucros · <empresa>` de `R$ 5.400,00`. E `resultado negativo não sugere` (empresa só com despesa 100,00 no mês → sem botão).
- [ ] **Step 2: RED.** **Step 3:** implementar (o painel PJ substitui o NCE para empresa; `taxTotal` = soma de `category_breakdown` do mês nas categorias `is_tax` do perfil). **Step 4: GREEN** + e2e completo. **Step 5:** commit.

---

### Task 4: Marcar categoria como imposto

**Files:** Modify `src/app/(app)/categorias/categories-client.tsx`, `src/actions/categories.ts`, `src/app/(app)/categorias/page.tsx`

- Produces: `CategoryUpdateSchema.is_tax: z.boolean().optional()`; no diálogo de edição de categoria **de despesa da empresa**, checkbox `É imposto (entra em "Impostos" no painel da empresa)`; na lista, selo `imposto` ao lado do nome.
- [ ] **Step 1: E2e** `marcar imposto`: na empresa, editar `Contabilidade` → marcar `É imposto` → salvar → selo `imposto` aparece ao lado de `Contabilidade`; na PF, o diálogo de uma despesa não mostra o checkbox.
- [ ] **Step 2: RED.** **Step 3:** implementar. **Step 4: GREEN.** **Step 5:** commit.

---

### Task 5: Página Relatórios + CSV

**Files:** Create `src/app/(app)/relatorios/page.tsx`, `src/app/(app)/relatorios/results-chart.tsx`, `src/app/(app)/relatorios/export/route.ts`; Modify `src/components/nav.tsx`, `src/proxy.ts`

**Interfaces:**
- Consumes: `get_monthly_summaries` (T1), `toTransactionsCsv` (T2), `transferView`/`profileLabel` (existentes).
- Produces: `GET /relatorios/export?from=YYYY-MM&to=YYYY-MM` → `text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="valoria-<from>-a-<to>.csv"`; período inválido ou maior que 24 meses → 400 com texto em pt-BR. Página com seletor de mês (padrão: mês atual) e de período para o CSV (padrão: últimos 12 meses).
- [ ] **Step 0:** carregar a skill `dataviz`.
- [ ] **Step 1: E2e** `relatórios`: com a empresa do teste e um lançamento no mês atual, `/relatorios` mostra tabela com cabeçalhos `Você (PF)`, `<empresa>`, `Consolidado` e linha `Resultado`; seção `Evolução dos últimos 12 meses` com um gráfico (`role="img"` com `aria-label` contendo "Resultado por perfil"); seção `Retiradas da empresa para você`; botão `Exportar CSV` baixa arquivo cujo conteúdo contém a descrição do lançamento e o nome da empresa. `relatórios só PF`: depois de excluir a empresa (afterAll já faz), acesso direto mostra colunas `Você (PF)` e `Consolidado` sem erro (teste roda num describe próprio após a limpeza, ou com conta sem empresa).
- [ ] **Step 2: RED.** **Step 3:** implementar (menu: item `Relatórios` na barra lateral e no menu do usuário quando `showSelector`). **Step 4: GREEN** + e2e completo + teste mobile 360px continua verde. **Step 5:** commit.

---

### Task 6: Revisão final e publicação

- [ ] Revisão independente (modelo mais capaz) só do app, com o Review Focus; correções Critical/Important com RED→GREEN.
- [ ] `npm run check`, `npm run build`, e2e local → push → deploy `READY` → e2e em produção → verificação read-only (0 sobras `e2e-`, nenhuma categoria `is_tax` fora de PJ).

---

## Self-review (feito)

- **Cobertura:** painel PJ com impostos/custos/pró-labore/resultado/retiradas (T3), sugestão de lucro com regra ≤ 0 e "outro valor" (T2/T3), `is_tax` no template e editável só na empresa (T1/T4), relatórios 1–4 (T5), CSV (T2/T5). Todos os itens restantes do spec ficam cobertos; nada da fase 4 sobra.
- **Nomes:** `is_tax`, `get_monthly_summaries`, `profitSuggestion`, `toTransactionsCsv`, `CsvTransaction`, `registerProfitDistribution`, `CompanyPanel`.
- **Review Focus:** 5 itens com teste na task dona.
