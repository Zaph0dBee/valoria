# Valoria — Parte 1.1: Planejamento em Categorias

Data: 22/08/2026

## Objetivo

Transformar Categorias e Subcategorias em uma estrutura de planejamento, sem misturar valores previstos com valores realizados.

Os valores realizados continuam vindo exclusivamente de `transactions`. Os novos campos funcionam como padrões de planejamento e serão aproveitados pela tela de Orçamento na Parte 2.

## Nova migration

`supabase/migrations/20260822000003_category_planning_settings.sql`

A migration é incremental e não altera as migrations 000001/000002 já aplicadas.

## Campos adicionados

Em categorias e subcategorias:

- valor planejado mensal;
- recorrência: sem recorrência, semanal, quinzenal, mensal ou anual;
- dia previsto / vencimento;
- tipo de gasto: fixa ou variável (despesas);
- considerar no orçamento;
- observações de planejamento;
- meta padrão vinculada (Construção / Aportes).

Nas subcategorias também foi adicionado:

- grupo Valoria/NCE específico (`group_override`). Quando vazio, a subcategoria herda o grupo da categoria principal.

## Comportamento Valoria/NCE

A view `nce_distribution` passa a usar:

1. grupo específico da subcategoria, quando houver;
2. grupo da categoria, quando não houver override.

Exemplo:

- Alimentação = Necessidades
- Supermercado = herda Necessidades
- Restaurantes = pode ser alterado para Estilo de vida

## Interface

### Editar categoria

Agora contém:

- nome;
- tipo (somente leitura);
- cor;
- grupo Valoria/NCE, quando aplicável;
- valor previsto/planejado mensal;
- recorrência;
- dia previsto/vencimento;
- fixa ou variável para despesas;
- meta vinculada para Construção/Aportes;
- considerar no orçamento;
- observações.

### Editar subcategoria

Agora contém:

- nome;
- categoria principal;
- grupo Valoria/NCE com opção "Herdar da categoria";
- valor previsto/planejado mensal;
- recorrência;
- dia previsto/vencimento;
- fixa ou variável para despesas;
- meta vinculada para Construção/Aportes;
- considerar no orçamento;
- observações.

### Lista de categorias

Valores planejados passam a aparecer de forma resumida na própria listagem.

Quando uma categoria possui subcategorias com valores planejados, o resumo da categoria usa a soma das subcategorias ativas no orçamento. Caso contrário, usa o valor planejado da própria categoria.

## Validações

- valores planejados não podem ser negativos;
- dia deve estar entre 1 e 31;
- receitas não recebem grupo NCE, fixa/variável ou meta vinculada;
- despesas não podem apontar para uma meta de reserva;
- metas vinculadas precisam pertencer ao usuário autenticado;
- RLS existente continua preservado.

## Verificações executadas

- `npm run typecheck`: OK
- `npm run lint`: OK, zero warnings
- `npm run build`: iniciado, mas o ambiente de revisão é Linux e o `node_modules` original é Windows. O Next tentou baixar `@next/swc-linux-x64-gnu`, porém este ambiente não tem acesso ao registry.npmjs.org. Não houve erro de TypeScript ou ESLint antes desse bloqueio de ambiente.

## Aplicação local

Após copiar o patch para a raiz do projeto:

```powershell
npm run check
npx supabase migration list
npx supabase db push --dry-run
npx supabase db push
npm run dev
```

Antes do `db push`, o esperado é que somente `20260822000003` esteja pendente.
