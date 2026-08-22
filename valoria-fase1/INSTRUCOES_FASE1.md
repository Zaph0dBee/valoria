# Valoria — Fase 1: Inteligência NCE + Semáforo Valoria

Este pacote implementa o coração da metodologia Valoria no dashboard:

- **Dark mode como padrão** (era light)
- **Grupos NCE** — cada categoria pode ser classificada como
  Necessidades / Construção / Estilo de vida / Livre
- **Faixas de referência Valoria** — sem julgamento, sem "ideal" rígido
- **Semáforo Valoria** — 🟢 dentro / 🟡 atenção / 🔴 acima da faixa
- **Distribuição da renda** — nova seção no dashboard mostrando pra onde
  seu dinheiro está indo, com a assinatura "Meu dinheiro está indo para onde eu quero?"

O banco recebe uma migration aditiva (não perde dados).

---

## Como aplicar (5 minutos)

### Passo 1 — Rodar a migration no Supabase

Isso é o passo mais importante e vem primeiro. Se você pular, os arquivos novos
vão dar erro porque procuram tabelas/colunas que ainda não existem.

1. Vai no dashboard do Supabase → **SQL Editor** → **New Query**
2. Abre o arquivo `supabase/migrations/20260821000001_add_nce_groups.sql`
3. Copia tudo, cola no SQL Editor
4. Clica em **Run**

Deve aparecer "Success. No rows returned". Isso adicionou:
- Um novo tipo `category_group` (enum)
- Uma nova coluna `group` na tabela `categories`
- Uma nova view `nce_distribution` que agrupa despesas/reservas por grupo NCE
- Atualização automática das categorias que vieram do template
- Atualização da função `seed_default_categories` pra próximos usuários já
  virem com grupos classificados

### Passo 2 — Para o servidor de dev

No terminal do VS Code:

```
Ctrl+C
```

(Se `npm run dev` estiver rodando.)

### Passo 3 — Copia os arquivos por cima

Extrai o zip e copia tudo de dentro de `valoria-fase1/` por cima da pasta
`norte`. No Explorer do Windows:

1. Abre `valoria-fase1/`
2. `Ctrl+A` pra selecionar tudo dentro
3. `Ctrl+C`
4. Cola em `norte/` — aceita "substituir arquivos existentes"

### Passo 4 — Sobe o servidor de novo

```powershell
npm run dev
```

Abre http://localhost:3000 no navegador. Faz login. Você deve ver:

- **Interface em modo escuro** por padrão
- **Nova seção** no dashboard: "Meu dinheiro está indo para onde eu quero?"
- **4 grupos** com barrinha de percentual, semáforo colorido e faixa Valoria
- Se você usou o template ao criar sua conta, as categorias já estão
  classificadas por grupo. Se criou do zero ou faltou classificar, aparece uma
  observação "Sem grupo classificado" (a UI de editar grupo vem na Fase 2)

### Passo 5 — Deploy

```powershell
git add .
git commit -m "feat: fase 1 valoria — NCE, faixas de referência, semáforo"
git push
```

A Vercel refaz o deploy sozinha. Espera 2-3 min.

---

## Filosofia por trás — importante entender

Cada peça da linguagem foi calibrada pra evitar julgamento:

- ❌ **Não usamos:** "ideal", "correto", "errado", "você está gastando demais"
- ✅ **Usamos:** "faixa de referência", "vale observar", "dentro da faixa",
  "atenção", "acima da faixa"

O semáforo comunica sem acusar:
- 🟢 **Dentro da faixa** — está no padrão observado em vidas financeiras saudáveis
- 🟡 **Atenção** — está fora da faixa, vale olhar
- 🔴 **Acima da faixa** — bem acima; é onde geralmente há maior oportunidade

Para Construção (investimentos), a lógica se inverte: valores **abaixo** do
mínimo viram 🟡, porque é atenção não estar construindo patrimônio.

---

## Faixas de referência Valoria (v1)

Baseadas em referências gerais de educação financeira. Você pode ajustar em
`src/lib/valoria-references.ts` conforme a metodologia da consultoria evoluir.

| Grupo | Faixa | Alto | Observação |
|---|---|---|---|
| **Necessidades** | 45–55% | > 65% | Moradia, transporte, alimentação básica |
| **Construção** | 15–25% | (sem limite) | Investimentos e reservas; abaixo de 15% vira 🟡 |
| **Estilo de vida** | 10–20% | > 30% | Lazer, restaurantes, roupas, viagens |
| **Livre** | 5–15% | > 25% | Variáveis pequenos, imprevistos |

Esses percentuais são sobre a **renda total** (soma de todas as receitas do mês).

---

## Arquivos alterados

| Arquivo | O que mudou |
|---|---|
| `src/app/layout.tsx` | Dark como tema padrão, `enableSystem: false` |
| `src/types/database.ts` | Adiciona `CategoryGroup` e view `nce_distribution` |
| `src/lib/valoria-references.ts` | **Novo** — faixas, semáforo, mensagens |
| `src/components/dashboard/nce-distribution.tsx` | **Novo** — o card completo |
| `src/app/(app)/dashboard/page.tsx` | Insere `<NCEDistribution />` |
| `supabase/migrations/20260821000001_add_nce_groups.sql` | **Novo** — migration aditiva |

---

## Próximas fases

A **Fase 2** vai adicionar:

- UI pra classificar/mudar o grupo das categorias existentes (na tela Categorias)
- **Diagnóstico automático do mês** — "Você está no caminho em 4 categorias.
  2 merecem atenção. Existe oportunidade de investir R$ 480/mês a mais."
- **Dinheiro invisível** — identificar assinaturas e pequenos gastos recorrentes
- **Comparação mês a mês** com setas ↑↓ e variação percentual
- **"Se você mudasse só uma coisa"** — sugestão focada

A **Fase 3** vai adicionar:

- **3 Perfis Valoria** (Organizar / Equilibrar / Acelerar) com réguas próprias
- **Metas inteligentes** que dialogam com a distribuição atual
- **Simulador "e se eu…?"**
- **Índice de Domínio Financeiro** (0-100) com evolução mensal

---

## Se algo der errado

**"column categories.group does not exist"** — a migration não foi rodada no
Supabase. Volta pro passo 1.

**Dashboard não mostra o card NCE** — verifica se o arquivo
`src/components/dashboard/nce-distribution.tsx` foi copiado.

**Tudo aparece "Sem grupo classificado"** — suas categorias existentes não
foram criadas via template. Isso é normal. Na Fase 2 adicionamos a UI pra
classificar. Por enquanto pode rodar isso no SQL Editor do Supabase pra
classificar manualmente (troque os nomes):

```sql
update public.categories set "group" = 'necessidades'
  where user_id = auth.uid()
  and name in ('Casa', 'Alimentação', 'Transporte', 'Saúde');

update public.categories set "group" = 'construcao'
  where user_id = auth.uid()
  and kind = 'reserva';

update public.categories set "group" = 'estilo'
  where user_id = auth.uid()
  and name in ('Lazer', 'Restaurantes', 'Roupas');
```
