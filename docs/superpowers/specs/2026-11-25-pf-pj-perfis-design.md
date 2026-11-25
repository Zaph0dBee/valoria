# PF + PJ no Valoria — perfis financeiros

Data: 2026-11-25 · Status: rascunho para aprovação

## Intenção

Quem tem empresa (MEI, autônomo, sócio) mistura vida pessoal e empresa no
dia a dia e não enxerga nenhuma das duas com clareza. O Valoria passa a
receber os dados **de PF e de PJ enviados pela própria pessoa**, guardá-los
separados e mostrar **cada lado e o consolidado** num lugar só, com
relatórios.

Hoje cada login tem um único controle financeiro (tudo pendurado em
`user_id`). Este projeto introduz **perfis financeiros**: um perfil PF por
pessoa e zero ou mais perfis PJ (empresas).

## Objetivos

1. A pessoa cadastra uma ou mais empresas (nome, CNPJ opcional).
2. Cada lançamento, categoria e saldo inicial pertence a um perfil.
3. Importar extrato (OFX/CSV) pedindo **de qual perfil** ele é.
4. Pró-labore / distribuição de lucros / aporte de capital registrados como
   **transferência entre perfis**, que no consolidado não conta como gasto
   nem como ganho.
5. Painel com seletor `Você (PF) | Empresa X | Consolidado`.
6. Página **Relatórios** com comparativo mensal por perfil e exportação CSV.

## Não-objetivos (agora)

- Conexão automática com banco (Open Finance / Pluggy) — próximo passo; o
  desenho apenas não pode impedir.
- Contas bancárias e cartões como entidades (saldo por conta, fatura).
- Notas fiscais, cálculo de impostos, DRE contábil formal.
- Acesso de terceiros (contador, consultor) à conta da pessoa.
- Consulta automática de CNPJ em serviço externo.

## Anti-objetivos (seria fracasso mesmo funcionando)

- **Contar dinheiro duas vezes**: pró-labore aparecendo como despesa da
  empresa *e* receita da pessoa no consolidado.
- **Perder ou alterar dados existentes** na migração.
- **Complicar a vida de quem não tem empresa**: com só o perfil PF, o app
  deve parecer exatamente como hoje (sem seletor, sem campo de perfil).

## Restrições

- Next.js 16 (App Router, Server Actions) + Supabase (Postgres, RLS,
  `security_invoker`). Seguir os padrões existentes: validação Zod nas
  actions, triggers de integridade no banco, RLS "dono tudo".
- Migrations incrementais em `supabase/migrations/`, idempotentes
  (`if not exists`, `create or replace`), preservando usuários atuais.
- **Produção tem usuários reais** (27 contas em 2026-11-25). A migração de
  perfis precisa ser segura para rodar sobre esses dados: backfill dentro da
  mesma transação, `not null` só depois do backfill, e conferência por
  contagem (nenhum lançamento/categoria sem perfil) antes de publicar o app.
- Migrations aplicadas pelo agente via Supabase MCP (projeto
  `tgtsfodmdoclscklhglz`); o Supabase registra a versão com o horário da
  aplicação, então o arquivo local é renomeado para bater.
- O app vai migrar para uma VPS (Supabase self-hosted). Nada aqui pode
  depender de recurso exclusivo do Supabase Cloud.
- Testes: Vitest para lógica pura, Playwright (`e2e/`) para fluxos; testes
  e2e limpam o que criam (marcador `e2e-`).

## Abordagens consideradas

| | Como | Prós | Contras |
|---|---|---|---|
| A. Marca PF/PJ no lançamento | coluna `scope` em `transactions` | rápido | uma empresa só; transferência na mão; refazer quando vier Open Finance |
| **B. Perfis (escolhida)** | tabela de perfis; lançamentos/categorias/saldos apontam para um perfil | várias empresas; categorias próprias por empresa; transferência resolvida; Open Finance só liga conta→perfil | migração e ajuste de todas as consultas |
| C. Contas bancárias completas | contas e cartões com saldo, cada uma num perfil | o mais completo | grande demais agora; faz sentido junto com Open Finance |

Escolhida pela pessoa: **B**, com recebimento de dados por **envio de
extrato** (import existente), deixando Open Finance para depois.

## Desenho

### Modelo de dados

**Nova tabela `financial_profiles`** (nome evita conflito com `profiles`,
que é o perfil do usuário):

| coluna | tipo | notas |
|---|---|---|
| id | uuid pk | |
| user_id | uuid → auth.users | RLS dono |
| kind | enum `profile_kind` (`pf`, `pj`) | |
| name | text | PF: nome da pessoa; PJ: nome fantasia |
| document | text null | CPF/CNPJ só dígitos; validado (dígitos verificadores) se informado |
| color | text | para o seletor e gráficos |
| archived | boolean | arquivar empresa sem apagar histórico |
| sort_order, created_at, updated_at | | padrão do projeto |

Regras: **exatamente um perfil `pf` por usuário** (índice único parcial
`(user_id) where kind = 'pf'`); criado no signup (estender
`handle_new_user`) e por backfill para usuários existentes. O perfil PF não
pode ser arquivado nem apagado.

**Colunas novas `profile_id` (not null após backfill):**

- `transactions.profile_id`
- `categories.profile_id` — categorias são **por perfil** (empresa tem as suas)
- `monthly_balances.profile_id` — unique passa a `(user_id, profile_id, year, month)`
- `imports.profile_id`
- `budgets.profile_id` e `recurring_transactions.profile_id` (Parte 2 —
  orçamento e recorrências; existem só no banco, sem telas e com 0 linhas em
  2026-11-25, mas entram já com perfil para que as telas futuras nasçam
  certas; `generate_recurring_transactions` copia o `profile_id` da regra
  para o lançamento gerado)

Subcategorias herdam o perfil da categoria (não precisam de coluna).
Metas (`reserves`) **continuam por usuário** (decisão do agente, v1): um
aporte de qualquer perfil pode alimentar qualquer meta.

**Backfill**: para cada usuário, criar o perfil PF (nome = `profiles.full_name`
ou e-mail) e preencher `profile_id` de todas as linhas existentes com ele.

**Integridade (triggers, no padrão de `validate_transaction_relations`)**:
perfil pertence ao usuário; categoria do lançamento pertence ao mesmo perfil
do lançamento; perfil de destino de transferência pertence ao usuário e é
diferente do de origem.

### Transferência entre perfis

Novo valor em `transaction_kind`: **`transferencia`**, mais a coluna
`transactions.counterpart_profile_id` (obrigatória quando
`kind = 'transferencia'`, nula nos outros casos).

Um único lançamento representa o movimento: sai de `profile_id`, entra em
`counterpart_profile_id`. **A pessoa lança uma vez, do lado da empresa**
(ex.: "Pró-labore" na Empresa Tal) e a PF passa a ver automaticamente a
entrada correspondente, rotulada com o nome da empresa:
**"Pró-labore · Empresa Tal"**, **"Lucros · Empresa Tal"**.

Motivo obrigatório em `transfer_reason` (enum): `pro_labore`, `lucros`,
`aporte_capital` (PF → PJ), `outro`. Transferência **não tem categoria**
(`category_id` nulo; o trigger de categoria ignora `transferencia`).

Como conta em cada visão (decisão da pessoa, 2026-11-25):

| motivo | na empresa (origem) | na PF (destino) | consolidado |
|---|---|---|---|
| `pro_labore` | **custo**: reduz o resultado (linha "Pró-labore") | **entrada** ("Pró-labore · Empresa"), entra na base da distribuição Valoria (NCE) | não conta |
| `lucros` | **não é custo**: distribuição do resultado (linha "Lucros distribuídos", abaixo do resultado) | **entrada** ("Lucros · Empresa"), entra na base NCE | não conta |
| `aporte_capital` (PF → PJ) | entrada de capital (não é faturamento) | saída (linha "Aporte na empresa", não é despesa de vida) | não conta |
| `outro` | saída sem efeito no resultado | entrada | não conta |

Na PF, "Entradas" = receitas próprias (salário de outro emprego etc.) +
transferências recebidas. Salário de outro emprego continua sendo receita
normal da PF.

Saldo do perfil: `saldo_inicial + receitas − despesas − aportes −
transf. enviadas + transf. recebidas`. Consolidado: soma dos saldos (as
transferências se anulam); receitas/despesas do consolidado excluem
transferências.

### Sugestão de distribuição de lucro

O lucro **não é puxado automaticamente**: o dinheiro só muda de conta quando
a pessoa faz a transferência no banco, e nem todo resultado pode ser
retirado (caixa para impostos, capital de giro). No painel da empresa, um
cartão mostra:

```
Resultado do mês            R$ 8.400,00
Já retirado (pró-labore)    R$ 3.000,00   ← informativo; já descontado do resultado
Lucros já distribuídos      R$ 0,00
Disponível para distribuir  R$ 8.400,00 − lucros já distribuídos
[ Registrar lucro de R$ … ]  [ outro valor ]
```

Confirmar cria a transferência `lucros` (Empresa → PF) com data de hoje,
editável. Se o resultado for ≤ 0, o cartão mostra o valor e não sugere
retirada.

### Transferência vinda dos dois extratos

Se a pessoa importar o extrato da empresa (saída) e o da PF (entrada) e
marcar as duas linhas como transferência, **não pode virar duas**. Na
importação, uma linha marcada como transferência que casa com uma
transferência existente entre os mesmos dois perfis (mesmo valor, data com
até 3 dias de diferença, ainda não "casada") é mostrada como **"já
registrada"** e pulada por padrão. Direção: numa linha de **entrada**, o
perfil escolhido na revisão é a **origem**; numa linha de **saída**, é o
**destino**.

> Atenção: todas as views/funções atuais usam `case kind when ... end`.
> Com o novo valor, cada uma precisa tratar `transferencia` explicitamente
> (senão o `case` devolve `null` e some das somas ou quebra totais).

### Consultas do painel

`get_monthly_financial_summary(target_year, target_month, target_profile uuid
default null)`:

- `target_profile` = id → resumo daquele perfil (saldo inicial próprio,
  transferências como linhas separadas).
- `null` → consolidado (soma dos perfis, transferências excluídas).
- Retorna as colunas atuais **mais** `transf_enviadas` e `transf_recebidas`.
  Manter a assinatura antiga funcionando (sobrecarga ou default) para não
  quebrar o que está publicado durante a transição.

`nce_distribution` e `category_breakdown` ganham `profile_id` na saída para
filtrar por perfil.

### Telas

**Seletor de perfil** (só aparece com 2+ perfis ativos): no topo do menu
lateral e no cabeçalho mobile. Opções: `Você (PF)`, cada empresa,
`Consolidado`. A escolha fica num cookie (`valoria_profile`) para os Server
Components lerem; padrão = PF.

Efeito por página:

| página | perfil escolhido | Consolidado |
|---|---|---|
| Painel | resumo do perfil; **PF** mostra a distribuição Valoria (NCE); **PJ** mostra painel de empresa: faturamento, custos por categoria, impostos, resultado, retiradas para PF | soma dos perfis; tabela PF × cada PJ; sem NCE |
| Lançamentos | lista do perfil | lista de todos, com coluna/etiqueta de perfil |
| Categorias | categorias do perfil | desabilitado (pedir para escolher um perfil) |
| Importar | importa para o perfil escolhido; se estiver em Consolidado, o seletor de perfil é obrigatório no próprio import | idem |
| Metas | inalterado (por usuário) | inalterado |

**Novo lançamento**: com 2+ perfis, campo "Perfil" (pré-selecionado com o
perfil atual). Tipo ganha **Transferência** (só com 2+ perfis), com campos
"De" / "Para" / "Motivo".

**Importar**: campo "De quem é este extrato?" (perfil). A checagem de
duplicados passa a ser **dentro do perfil**. Na revisão, cada linha pode
virar "Transferência" escolhendo o perfil de destino.

**Empresas** (nova seção em Configurações ou página `/empresas`): criar,
editar (nome, CNPJ, cor) e arquivar empresas. Ao criar, oferecer o
**template de categorias PJ**:

- Receitas: Vendas, Prestação de serviços, Outras receitas
- Despesas: Impostos (DAS/Simples), Fornecedores e insumos, Folha e
  encargos, Aluguel e estrutura, Software e ferramentas, Marketing, Tarifas
  bancárias, Contabilidade, Outros

**Relatórios** (`/relatorios`), v1:

1. Comparativo do mês: tabela com colunas `PF | Empresa… | Consolidado` e
   linhas Entradas, Saídas, Resultado, Aportes, Transferências, Saldo final.
2. Evolução dos últimos 12 meses: resultado por perfil (gráfico de linhas,
   Recharts — já é dependência).
3. Retiradas da empresa para a PF no período (pró-labore × lucros).
4. Exportar CSV do período escolhido (lançamentos com coluna de perfil).

### Outras decisões (do agente, revisáveis)

- **Empresa arquivada continua contando** no consolidado e nos relatórios;
  arquivar só a tira do seletor e de novos lançamentos/importações.
- **"Impostos" no painel PJ** vem de uma marca `is_tax boolean` em
  `categories`: ligada no template ("Impostos (DAS/Simples)") e editável em
  qualquer categoria da empresa. Custos = despesas sem a marca.
- **Perfil PJ não faz aporte (`reserva`)** para metas: para guardar dinheiro
  da empresa numa meta pessoal, primeiro transfere para a PF. Evita misturar
  PF e PJ em silêncio. Categorias PJ não usam `"group"` nem
  `default_reserve_id`.
- **Nomes dos perfis aparecem em tudo**: seletor, etiqueta dos lançamentos
  ("Pró-labore · Empresa Tal") e relatórios.

### Quem só tem PF

Sem empresas cadastradas, nada muda visualmente: sem seletor, sem campo
"Perfil", sem tipo Transferência. A única novidade visível é o caminho para
"Adicionar empresa".

## Fases sugeridas (cada uma entregável e publicada)

1. **Fundação**: tabela de perfis, colunas, backfill, triggers, função de
   resumo com perfil. App continua idêntico para todos (tudo no PF).
2. **Empresas + seletor + filtros** em Painel/Lançamentos/Categorias/Import.
3. **Transferências** (tipo novo, formulário, import, contas no resumo).
4. **Painel PJ (com sugestão de lucro) + Relatórios + CSV.**

## Deixado para o construtor

- Nomes finais de componentes/arquivos, estrutura de pastas.
- Como manter compatibilidade da função de resumo durante a transição.
- Estratégia de testes SQL (se houver) além de Vitest/Playwright.
- Detalhes visuais seguindo o design system atual (Cormorant/Montserrat,
  paleta Valoria, `swatch`, tabelas responsivas já corrigidas).
- Mensagens e textos de interface em pt-BR no tom do app.
