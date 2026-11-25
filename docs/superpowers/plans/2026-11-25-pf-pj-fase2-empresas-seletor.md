# PF + PJ — Fase 2 (Empresas + seletor de perfil) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pessoa cadastra empresas (PJ), troca entre `Você (PF) | Empresa X | Consolidado` e vê Painel, Lançamentos, Categorias e Importar filtrados pelo perfil escolhido.

**Architecture:** Uma migration ajusta o banco para dados por perfil (chaves únicas, views com `profile_id`, template de categorias PJ, PJ sem aporte). No app, um módulo de contexto de perfil lê o cookie `valoria_profile` no servidor e todas as páginas filtram por ele; um seletor no menu (só com 2+ perfis ativos) grava o cookie por Server Action. Empresas são gerenciadas em `/empresas`.

**Tech Stack:** Next.js 16 (App Router, Server Components, Server Actions, `cookies()`), Supabase (Postgres/RLS, MCP), Zod, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-25-pf-pj-perfis-design.md` (seções "Telas", "Quem só tem PF", "Outras decisões", "Fases sugeridas" item 2). Fase 1 já em produção: `docs/superpowers/plans/2026-11-25-pf-pj-fase1-fundacao.md`.

## Global Constraints

- Projeto Supabase `tgtsfodmdoclscklhglz`, **27 usuários reais**. Migration ensaiada em `begin … rollback` (ver `scripts/db-dry-run.md`) antes do `apply_migration`; renomear o arquivo para a versão registrada.
- Cookie: nome `valoria_profile`; valores: id de um perfil ativo ou `all` (Consolidado); `path=/`, `sameSite=lax`, `maxAge` 1 ano, `httpOnly`.
- **Quem só tem PF vê o app como hoje**: sem seletor, sem campo "Perfil". Única novidade visível: item "Minhas empresas" no menu do usuário.
- Template PJ (spec, literal): Receitas `Vendas`, `Prestação de serviços`, `Outras receitas`; Despesas `Impostos (DAS/Simples)`, `Fornecedores e insumos`, `Folha e encargos`, `Aluguel e estrutura`, `Software e ferramentas`, `Marketing`, `Tarifas bancárias`, `Contabilidade`, `Outros`.
- **Perfil PJ não faz aporte (`reserva`)** e não tem categorias de aporte (decisão registrada no spec).
- Empresa arquivada continua contando no Consolidado; some do seletor e não recebe lançamentos novos (já garantido no banco pela fase 1).
- CNPJ opcional; se informado, 14 dígitos com dígitos verificadores válidos; guardado só com dígitos.
- Textos de interface em pt-BR no tom do app. Menu mobile precisa caber em 360px (teste existente `e2e/mobile.spec.ts`).
- Entrega: `npm run check` + `npm run build` + `npm run test:e2e` (local e produção) verdes → push direto na `main`.

## Review Focus

1. **Cookie apontando para empresa arquivada, de outro usuário ou inexistente** → cair no PF, nunca erro nem dados vazios. Teste: `resolveProfileSelection` casos `arquivada`, `desconhecido` (Task 2).
2. **Consolidado + criar lançamento/categoria** → o formulário exige escolher o perfil; categorias do select são as do perfil escolhido. Teste e2e `consolidado pede perfil` (Task 5).
3. **Empresa e PF com categoria de mesmo nome** (ex.: "Aluguel") → permitido. Teste SQL `t2_02_mesmo_nome_em_perfis` (Task 1).
4. **Importar o mesmo extrato na PF e depois na empresa** → não é duplicado (dedupe é por perfil). Teste e2e `mesmo CSV em perfis diferentes` (Task 6).
5. **Excluir empresa criada por engano** → permitido só sem lançamentos; com lançamentos, orientar a arquivar. Teste SQL/e2e `t2_06_excluir_empresa` (Task 1) + e2e cleanup (Task 3).

---

## File Structure

| arquivo | responsabilidade |
|---|---|
| `supabase/migrations/<versão>_profiles_phase2.sql` | chaves únicas por perfil, views com `profile_id`, `apply_pj_template`, PJ sem aporte, `delete_company`, correção do nome PF |
| `supabase/tests/phase2_profiles.test.sql` | testes SQL da fase 2 (dry-run) |
| `src/lib/cnpj.ts` (+ `.test.ts`) | `normalizeDocument`, `isValidCnpj` |
| `src/lib/profile-selection.ts` (+ `.test.ts`) | lógica pura de resolver o cookie |
| `src/lib/profile-context.ts` | leitura no servidor (perfis + cookie) |
| `src/actions/profiles.ts` | `setActiveProfile`, `createCompany`, `updateCompany`, `setCompanyArchived`, `deleteCompany` |
| `src/components/profile-switcher.tsx` | seletor (desktop e mobile) |
| `src/app/(app)/empresas/page.tsx`, `companies-client.tsx` | gestão de empresas |
| modificar: `src/app/(app)/layout.tsx`, `src/components/nav.tsx`, `src/proxy.ts`, páginas e clients de dashboard/transacoes/categorias/importar, `src/actions/{transactions,categories,imports,monthly-balances}.ts`, `src/components/dashboard/opening-balance-editor.tsx`, `src/types/database.ts` |
| `e2e/companies.spec.ts` | fluxo ponta a ponta com empresa |

---

### Task 1: Banco — dados por perfil

**Files:**
- Create: `supabase/migrations/2026112500YYYY_profiles_phase2.sql`, `supabase/tests/phase2_profiles.test.sql`

**Interfaces:**
- Produces:
  - Unique `categories (profile_id, name, kind)` substituindo `categories_user_id_name_kind_key`; `apply_financial_template` passa a usar `on conflict (profile_id, name, kind)` (recriar a função **a partir da definição atual** com `pg_get_functiondef` + `replace` dentro de um `do $$`, conferindo que exatamente 3 ocorrências foram trocadas; senão `raise`). Confirmar o nome real das constraints com `select conname from pg_constraint where conrelid in ('public.categories'::regclass,'public.monthly_balances'::regclass) and contype='u'` antes de escrever.
  - Unique `monthly_balances (profile_id, year, month)` **adicionada ao lado** de `monthly_balances_user_id_year_month_key` (a antiga só sai na Task 7, depois que o app novo estiver no ar — o app publicado hoje faz upsert com `onConflict: 'user_id,year,month'`).
  - Views `nce_distribution` e `category_breakdown` com coluna **final** `profile_id` (e no `group by`).
  - `public.apply_pj_template(target_profile uuid) returns void` — `security invoker`; insere as categorias do template PJ (Global Constraints) no perfil, `on conflict (profile_id, name, kind) do nothing`; recusa (23514) se o perfil não for `pj` ou não for do `auth.uid()`.
  - `validate_profile_relations` (create or replace, fase 1) ganha: perfil `pj` + `kind = 'reserva'` em `transactions`, `recurring_transactions` ou `categories` → `'Empresas não fazem aporte em metas. Transfira para a PF primeiro.'` (23514).
  - `public.delete_company(target_profile uuid) returns void` — `security invoker`; recusa se não for PJ do usuário (`'Empresa não encontrada'`) ou se houver lançamentos (`'Esta empresa tem lançamentos. Arquive em vez de excluir.'`); senão apaga `budgets`, `recurring_transactions`, `monthly_balances`, `imports`, `categories` (subcategorias em cascata) do perfil e o perfil.
  - Correção do nome PF: `update financial_profiles fp set name = coalesce(nullif(split_part(u.email,'@',1),''),'Você') from auth.users u where fp.user_id = u.id and fp.kind = 'pf' and fp.name = u.email`.
  - `revoke execute on function public.pf_profile_id(uuid) from public, anon;`

- [ ] **Step 1: Escrever `supabase/tests/phase2_profiles.test.sql`** (usuários sintéticos `bbbbbbbb-…-0001/2`, mesmo estilo de `phase1_financial_profiles.test.sql`; termina em `select 'ALL PASSED'`):

| teste | asserção |
|---|---|
| `t2_01_template_pj` | `apply_pj_template(pj)` cria 12 categorias (3 receita + 9 despesa) no PJ; rodar 2× não duplica |
| `t2_02_mesmo_nome_em_perfis` | PF e PJ podem ter `('Aluguel','despesa')`; o segundo no mesmo perfil dá `unique_violation` |
| `t2_03_pj_sem_aporte` | insert `transactions` `kind='reserva'` no PJ → 23514; categoria `kind='reserva'` no PJ → 23514; no PF continua permitido |
| `t2_04_saldo_por_perfil` | PJ com `monthly_balances` em `(2026,3)` (PF sem saldo nesse mês); `get_monthly_financial_summary(2026,3,pj).saldo_inicial` = valor do PJ. (PF e PJ no **mesmo** mês: teste `t2_09` na Task 7, após remover a chave antiga.) |
| `t2_05_views_por_perfil` | `category_breakdown` e `nce_distribution` têm `profile_id`; despesa do PJ aparece só com o `profile_id` do PJ |
| `t2_06_excluir_empresa` | `delete_company` com lançamento → 23514/mensagem; sem lançamento (só template) → perfil e categorias somem; no PF → recusa |
| `t2_07_template_pf_ainda_funciona` | usuário novo logado (`set local role authenticated`) chama `seed_default_categories` e recebe as categorias PF (o `on conflict` novo funciona) |
| `t2_08_nome_pf` | nenhum PF com `name` igual ao e-mail do dono |

- [ ] **Step 2: RED** — `begin; <testes>; rollback;` → falha em `apply_pj_template does not exist`.
- [ ] **Step 3: Escrever a migration** (Interfaces acima).
- [ ] **Step 4: GREEN** — `begin; <snapshot da fase 1 (supabase/tests/phase1_regression_snapshot.sql)> + <migration> + <testes fase 1> + <testes fase 2>; rollback;` → `ALL PASSED` e `REGRESSION OK` (painel idêntico para todos os usuários, pois ninguém tem PJ ainda). Os testes da fase 1 continuam válidos porque a chave antiga do saldo ainda existe.
- [ ] **Step 5: Aplicar** (`apply_migration` nome `profiles_phase2`), renomear o arquivo para a versão registrada, conferir md5 (sem `\r`) com `statements[1]`, rodar os testes no banco migrado (`begin; <testes>; rollback;`) e `get_advisors`. A migration é **compatível com o app publicado** (nenhuma chave usada por ele some; views só ganham coluna no fim). Necessário aplicar agora porque os e2e das Tasks 3–6 rodam o app local contra o banco de produção.
- [ ] **Step 6: Commit** (sem push).

> **Ordem de publicação:** as Tasks 2–6 fazem commit local e **não** dão push — assim nenhum usuário real vê "Minhas empresas" antes de todas as telas filtrarem por perfil. O push acontece só na Task 7.

---

### Task 2: Contexto de perfil + seletor + empresas

**Files:**
- Create: `src/lib/cnpj.ts`, `src/lib/cnpj.test.ts`, `src/lib/profile-selection.ts`, `src/lib/profile-selection.test.ts`, `src/lib/profile-context.ts`, `src/actions/profiles.ts`, `src/components/profile-switcher.tsx`, `src/app/(app)/empresas/page.tsx`, `src/app/(app)/empresas/companies-client.tsx`
- Modify: `src/app/(app)/layout.tsx`, `src/components/nav.tsx`, `src/proxy.ts` (proteger `/empresas`), `src/types/database.ts` (Functions `apply_pj_template`, `delete_company`; Views com `profile_id`)

**Interfaces:**
- Produces:
  - `normalizeDocument(value: string): string` (só dígitos) e `isValidCnpj(digits: string): boolean`.
  - `type ProfileSelection = { mode: 'profile'; profileId: string } | { mode: 'consolidated' }`
  - `resolveProfileSelection(cookie: string | undefined, profiles: Pick<FinancialProfile,'id'|'kind'|'archived'>[]): ProfileSelection` — ativos = não arquivados; `cookie === 'all'` e ativos ≥ 2 → consolidated; cookie = id de ativo → esse; qualquer outro caso → PF.
  - `export const PROFILE_COOKIE = 'valoria_profile'`
  - `getProfileContext(): Promise<{ profiles: FinancialProfile[]; active: ProfileSelection; activeProfile: FinancialProfile | null; pf: FinancialProfile; showSelector: boolean }>` — `profiles` ordenados `kind, sort_order, created_at` (inclui arquivados, para rótulos); `showSelector` = ativos ≥ 2; `activeProfile` null no consolidado.
  - Server Actions em `src/actions/profiles.ts`: `setActiveProfile(value: string)`; `createCompany({ name, document?, color?, useTemplate: boolean })` → `{ ok, id } | { error }`; `updateCompany(id, { name?, document?, color? })`; `setCompanyArchived(id, archived: boolean)`; `deleteCompany(id)` (chama RPC `delete_company`). Todas com Zod; `document` passa por `normalizeDocument` e, se não vazio, precisa `isValidCnpj` → `'CNPJ inválido'`. `createCompany` com `useTemplate` chama RPC `apply_pj_template`. Todas fazem `revalidatePath('/', 'layout')`.
  - `<ProfileSwitcher profiles active />` (client): lista ativos (PF primeiro, rotulado `Você (PF)`, PJs pelo nome) + `Consolidado` + link `Gerenciar empresas`; ao escolher chama `setActiveProfile` e `router.refresh()`.

- [ ] **Step 1: Testes Vitest** — `cnpj.test.ts`: válido `11.222.333/0001-81` → `normalizeDocument` = `'11222333000181'` e `isValidCnpj` true; `11222333000182` false; `00000000000000` false; 13 dígitos false. `profile-selection.test.ts`: sem cookie → PF; `all` com 1 ativo → PF; `all` com 2 ativos → consolidated; id de PJ ativo → esse; **id de PJ arquivado → PF**; **id desconhecido → PF**.
- [ ] **Step 2: RED** — `npx vitest run src/lib/cnpj.test.ts src/lib/profile-selection.test.ts` → módulos inexistentes.
- [ ] **Step 3: Implementar** `cnpj.ts`, `profile-selection.ts`; depois `profile-context.ts`, `actions/profiles.ts`, `ProfileSwitcher`, página `/empresas` (lista PJs com nome, CNPJ formatado, cor, status; diálogo criar/editar com "Começar com categorias de empresa" marcado por padrão; arquivar/reativar; excluir com confirmação). `AppLayout` chama `getProfileContext()` e passa para `AppNav`; `AppNav` renderiza o seletor abaixo do logo (desktop) e no cabeçalho mobile (compacto: cor + nome truncado, abre lista) só se `showSelector`; menu do usuário ganha `Minhas empresas` → `/empresas`.
- [ ] **Step 4: GREEN** — testes Vitest acima passam; `npm run check` verde.
- [ ] **Step 5: Commit.**

---

### Task 3: Painel e saldo inicial por perfil

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`, `src/components/dashboard/opening-balance-editor.tsx`, `src/actions/monthly-balances.ts`

**Interfaces:**
- Consumes: `getProfileContext()` (Task 2); RPC 3 args e views com `profile_id` (Task 1).
- Produces: `setMonthlyOpeningBalance({ year, month, opening_balance, profile_id })` e `removeMonthlyOpeningBalance(year, month, profileId)` — upsert com `onConflict: 'profile_id,year,month'`; o action confirma que o perfil é do usuário e está ativo.

- [ ] **Step 1: Teste e2e (em `e2e/companies.spec.ts`, criado aqui)** — `beforeAll`: cria empresa `Empresa e2e-<RUN_ID>` com template via `/empresas`; `afterAll`: apaga lançamentos `e2e-` e exclui a empresa (`deleteCompany`). Teste `painel por perfil`: no PF, eyebrow contém `você (pf)`; troca para a empresa no seletor → eyebrow contém o nome da empresa e o bloco "Meu dinheiro está indo para onde eu quero?" **não** aparece; em `Consolidado`, eyebrow `consolidado` e "Definir saldo inicial" não aparece.
- [ ] **Step 2: RED** — `npx playwright test e2e/companies.spec.ts` → falha (seletor/eyebrow inexistentes).
- [ ] **Step 3: Implementar** — `summary` via `get_monthly_financial_summary(y, m, activeProfileId ?? null)`; `category_breakdown`/`nce_distribution` com `.eq('profile_id', id)` no modo perfil; NCE só quando o perfil ativo é PF; editor de saldo inicial só no modo perfil, com `profile_id`; eyebrow `painel · <perfil> · <mês>` (`você (pf)`, nome da empresa em minúsculas, ou `consolidado`).
- [ ] **Step 4: GREEN** — e2e acima + `npm run test:e2e` completo.
- [ ] **Step 5: Commit.**

---

### Task 4: Categorias por perfil

**Files:**
- Modify: `src/app/(app)/categorias/page.tsx`, `src/app/(app)/categorias/categories-client.tsx`, `src/actions/categories.ts`

**Interfaces:**
- Consumes: `getProfileContext()`.
- Produces: `createCategory` aceita `profile_id` (obrigatório no schema; a página envia o perfil ativo).

- [ ] **Step 1: Teste e2e `categorias por perfil`** — na empresa, a coluna "Despesas" lista `Impostos (DAS/Simples)` e **não** lista `Casa`; não existe a coluna "Construção / Aportes"; no PF, `Casa` aparece; em Consolidado aparece o texto `Escolha um perfil para ver e editar categorias.`
- [ ] **Step 2: RED.**
- [ ] **Step 3: Implementar** — consultas `.eq('profile_id', id)`; colunas `['receita','despesa']` para PJ; consolidado mostra o aviso com botões para cada perfil (chamam `setActiveProfile`).
- [ ] **Step 4: GREEN.**
- [ ] **Step 5: Commit.**

---

### Task 5: Lançamentos por perfil

**Files:**
- Modify: `src/app/(app)/transacoes/page.tsx`, `src/app/(app)/transacoes/transactions-client.tsx`, `src/actions/transactions.ts`

**Interfaces:**
- Consumes: `getProfileContext()`.
- Produces: `TransactionSchema.profile_id: z.string().uuid()` (obrigatório); `validateRelations` confere que a categoria é do mesmo perfil (mensagem `'A categoria pertence a outro perfil'`) e que PJ não usa `reserva`.

- [ ] **Step 1: Testes e2e** — `lançamento na empresa não aparece na PF`: na empresa cria despesa `Despesa e2e-<RUN_ID>` 100,00 em `Marketing` → aparece; troca para PF → não aparece; Consolidado → aparece com a etiqueta do nome da empresa. `consolidado pede perfil`: em Consolidado, "Novo lançamento" mostra o campo `Perfil`; ao escolher a empresa, o select de categoria lista `Marketing` e não `Casa`; o tipo `Aporte` fica desabilitado.
- [ ] **Step 2: RED.**
- [ ] **Step 3: Implementar** — página filtra por perfil no modo perfil e traz `financial_profiles(name, color, kind)` no consolidado; categorias carregadas com `profile_id` e filtradas no client pelo perfil escolhido no formulário; campo `Perfil` só com `profiles` ativos ≥ 2 (padrão = ativo; no consolidado = PF); trocar o perfil limpa categoria/subcategoria; `Aporte` desabilitado para PJ.
- [ ] **Step 4: GREEN** (e2e completo).
- [ ] **Step 5: Commit.**

---

### Task 6: Importar por perfil

**Files:**
- Modify: `src/app/(app)/importar/page.tsx`, `src/app/(app)/importar/import-client.tsx`, `src/actions/imports.ts`

**Interfaces:**
- Consumes: `getProfileContext()`; `splitDuplicates` (existente).
- Produces: `importTransactions({ source, filename, rows, profile_id })`; dedupe consulta só `.eq('profile_id', profile_id)`; categorias validadas contra o perfil; linhas `reserva` recusadas em PJ.

- [ ] **Step 1: Teste e2e `mesmo CSV em perfis diferentes`** — CSV de 1 linha `Importado e2e-<RUN_ID>`: importar na PF → `1 lançamentos importados`; importar o mesmo na empresa → `1 lançamentos importados` (não "Nada novo"); importar de novo na empresa → `Nada novo para importar`. O campo `De quem é este extrato?` aparece só com 2+ perfis e vem com o perfil ativo selecionado (no consolidado, vazio e obrigatório).
- [ ] **Step 2: RED.**
- [ ] **Step 3: Implementar** — select de perfil no topo do cartão do arquivo; categorias por perfil escolhido; lista "Imports anteriores" mostra o nome do perfil quando há 2+.
- [ ] **Step 4: GREEN.**
- [ ] **Step 5: Commit.**

---

### Task 7: Publicar e remover a chave antiga do saldo

**Files:**
- Create: `supabase/migrations/<versão>_monthly_balances_unique_per_profile.sql`
- Modify: `supabase/tests/phase2_profiles.test.sql` (adiciona `t2_09`), `supabase/tests/phase1_financial_profiles.test.sql` (`t04` passa a `on conflict (profile_id, year, month)`)

- [ ] **Step 1:** `npm run check`, `npm run build`, `npm run test:e2e` local. Expected: tudo verde (e2e antigos + `companies.spec.ts`).
- [ ] **Step 2:** Push `main`; aguardar deploy `READY`; `E2E_BASE_URL=https://valoria-azadi.vercel.app npm run test:e2e`. Expected: verde. Agora o app publicado usa `onConflict: 'profile_id,year,month'`.
- [ ] **Step 3: Teste `t2_09_pf_e_pj_mesmo_mes`** — PF e PJ com `monthly_balances` no mesmo `(2026,3)` coexistem e cada resumo usa o seu. RED com a chave antiga presente (`unique_violation`).
- [ ] **Step 4:** Migration `alter table public.monthly_balances drop constraint if exists monthly_balances_user_id_year_month_key;` (nome conferido na Task 1); atualizar `t04` da fase 1; ensaiar (`ALL PASSED`), aplicar, renomear, md5.
- [ ] **Step 5:** Verificação read-only: `select count(*) from categories c join financial_profiles p on p.id=c.profile_id where p.user_id<>c.user_id` = 0; nenhum PF com nome = e-mail; advisors sem avisos novos da fase 2; 0 empresas e 0 lançamentos `e2e-` restantes. Rodar `npm run test:e2e` em produção de novo. Commit + push.

---

## Self-review (feito)

- **Cobertura (fase 2 do spec):** empresas + CNPJ + template PJ (T1/T2); seletor com cookie, só 2+ perfis (T2); Painel/NCE só PF/Consolidado sem NCE (T3); Categorias por perfil, bloqueadas no consolidado (T4); Lançamentos com campo Perfil e etiqueta no consolidado (T5); Importar com "De quem é este extrato?" e dedupe por perfil (T6); PJ sem aporte (T1/T5); arquivada conta no consolidado (fase 1 + T2 contexto inclui arquivadas nos rótulos). Transferências, painel PJ e relatórios: fases 3–4.
- **Nomes consistentes:** `getProfileContext`, `resolveProfileSelection`, `ProfileSelection`, `PROFILE_COOKIE`, `setActiveProfile`, `apply_pj_template`, `delete_company` usados igual em todas as tasks.
- **Review Focus:** os 5 itens têm teste na task dona.
