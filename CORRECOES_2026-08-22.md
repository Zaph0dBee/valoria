# Correções técnicas — 22/08/2026

Este arquivo registra as correções feitas no projeto Norte/Valoria sem alterar as variáveis existentes do Supabase.

## 1. Next.js 16

- `src/middleware.ts` foi migrado para `src/proxy.ts`.
- O helper `src/lib/supabase/middleware.ts` foi reorganizado como `src/lib/supabase/proxy.ts`.
- O Proxy agora valida a identidade com `supabase.auth.getClaims()`.
- A opção antiga `eslint` foi removida de `next.config.mjs`.
- `typescript.ignoreBuildErrors` foi removido: erros de TypeScript voltam a bloquear builds inválidos.
- A configuração de Server Actions com limite de 5 MB foi preservada.
- O header `X-Powered-By` do Next foi desativado.

## 2. TypeScript e Supabase

- `src/types/database.ts` foi reestruturado no formato compatível com os tipos atuais do `supabase-js`.
- Foram adicionados tipos completos de `Row`, `Insert`, `Update`, `Relationships`, Views, Enums e RPC.
- A pasta histórica `valoria-fase1` foi excluída do `tsconfig` principal para não duplicar a compilação.
- Foi adicionado o script `npm run typecheck`.
- Foi adicionado o script `npm run check` para executar typecheck + lint.

Observação: o lock atual combina `@supabase/ssr` antigo com `supabase-js` mais novo. Foi mantida uma ponte de tipagem nos clients para não alterar dependências sem conseguir regenerar o lock de forma confiável. O comportamento em runtime permanece o mesmo.

## 3. Segurança e integridade do Supabase

Foi criada a migration:

`supabase/migrations/20260822000001_security_and_integrity.sql`

Ela:

- protege `seed_default_categories(uuid)` para aceitar apenas o UUID do próprio usuário autenticado;
- revoga execução da RPC para `public` e `anon` e libera apenas para `authenticated`;
- torna o seed idempotente para evitar duplicação em callbacks repetidos;
- corrige `monthly_summary` para retornar zero em vez de `NULL` quando não houver receita, despesa ou reserva no mês;
- adiciona validações no banco para impedir subcategorias, categorias e orçamentos vinculados a outro usuário;
- impede uma transação de usar uma categoria com tipo incompatível;
- impede uma subcategoria de ser usada fora da sua categoria.

### Importante antes do próximo deploy

Aplique a migration acima no projeto Supabase existente. Não rode novamente as migrations iniciais em um banco que já está criado.

Você pode aplicar pelo SQL Editor do Supabase ou pelo fluxo de migrations/CLI que já utilizar no projeto.

## 4. Server Actions

Foram adicionadas validações com Zod e verificações de propriedade para:

- categorias;
- subcategorias;
- lançamentos;
- metas/reservas;
- importações CSV/OFX.

IDs passam a ser validados como UUID, valores precisam ser finitos/válidos e updates vazios são rejeitados.

## 5. Lançamentos

- Categoria selecionada precisa pertencer ao usuário.
- Categoria precisa ter o mesmo tipo do lançamento.
- Subcategoria precisa pertencer ao usuário e à categoria selecionada.
- Updates são validados junto com os valores já salvos para evitar combinações inconsistentes.

## 6. Importação CSV/OFX

- Limite de arquivo: 5 MB.
- Limite de lançamentos por importação: 2.000.
- Nome do arquivo, datas, valores e descrições são validados no servidor.
- IDs de categorias vindos do payload são conferidos contra a conta autenticada.
- A conversão de datas CSV não usa mais `toISOString()` no fallback, evitando deslocamentos por UTC.

## 7. Redirecionamentos de autenticação

Foi criado `src/lib/navigation.ts` com sanitização do parâmetro `next`.

Isso impede redirecionamentos externos ou URLs perigosas após login/callback.

## 8. Datas e fuso horário

- Datas `YYYY-MM-DD` são exibidas sem deslocamento para o dia anterior.
- `todayISO()` e `currentMonth()` usam explicitamente `America/Sao_Paulo` por padrão.
- O dashboard valida mês e ano recebidos pela URL.
- O intervalo mensal é construído como data civil, sem conversão UTC.

## 9. ESLint e organização

- Foi criado `eslint.config.mjs` compatível com ESLint 9.
- O comando antigo `next lint` foi substituído por `eslint .`.
- Imports e variáveis não utilizados foram removidos.
- Tailwind e PostCSS foram ajustados para passar no lint atual.

## Validações executadas

- TypeScript: aprovado, zero erros.
- ESLint: aprovado, zero erros/warnings.
- `git diff --check`: aprovado.
- Build Next.js: iniciado, mas o ambiente de análise contém somente o binário SWC para Windows que veio no ZIP. O Next tentou baixar o SWC para Linux e a rede do ambiente bloqueou o acesso ao npm. Isso não representa um erro do código; o build deve ser validado novamente no Windows ou pela Vercel depois de instalar dependências normalmente.

## Ordem recomendada para publicar

1. Fazer backup/commit da versão atual.
2. Aplicar `20260822000001_security_and_integrity.sql` no Supabase.
3. Executar `npm install` no projeto em sua máquina.
4. Executar `npm run check`.
5. Executar `npm run build`.
6. Testar login, cadastro, criação/edição de lançamento, categorias, metas e importação.
7. Publicar na Vercel.
