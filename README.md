# Norte

**Controle financeiro pessoal.** Substituto para a planilha clássica de orçamento familiar,
com auth, banco de dados, categorias customizáveis e import de extratos CSV/OFX.

Feito com Next.js 15 (App Router), Supabase (auth + Postgres + RLS), shadcn/ui,
Tailwind, deploy pra Vercel.

---

## O que já está pronto (v1)

- **Auth multi-usuário** — signup, login, session persistente. Cada usuário só enxerga
  seus próprios dados (RLS no banco).
- **Dashboard mensal** — saldo do mês em destaque, comparação com mês anterior,
  breakdown por categoria, últimos lançamentos, navegação por mês.
- **Lançamentos** — CRUD completo com tipo (receita/despesa/reserva),
  categoria, subcategoria, data, valor, observações.
- **Categorias customizáveis** — o usuário cria/edita/apaga do zero, ou começa com
  o template das 10 categorias da planilha clássica (Casa, Transporte, Alimentação,
  Crianças, Lazer, Saúde, Gastos Pessoais, Férias, Pet, Custos Financeiros) mais
  subcategorias comuns.
- **Metas & Reservas** — reserva de emergência, viagem, etc, com progresso e botões
  rápidos de aporte (+100, +500, +1000).
- **Import CSV/OFX** — upload de extrato, reconhecimento automático das colunas
  mais comuns (pt-BR e en), preview editável antes de salvar, categorização em
  massa. Suporta OFX padrão dos bancos brasileiros.
- **Dark mode** — toggle no menu lateral, persistente por usuário.
- **Design próprio** — não é dashboard genérico. Base papel quente + azul-tinta
  profundo, Fraunces serif para números grandes, tabular-nums em todas as leituras
  financeiras.

## O que fica para o v2

- Orçamento previsto vs realizado por categoria
- Gráficos de série temporal (evolução do saldo, tendências)
- Alertas de estouro de categoria
- Billing (Stripe) — abrir como SaaS pago
- Import de foto de comprovante via Gemini Vision
- App mobile (React Native)

---

## Setup

### 1. Supabase

1. Crie um projeto em https://supabase.com/dashboard
2. Na página do projeto, vá em **Settings → API** e copie:
   - `URL` → vai para `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → vai para `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Vá em **SQL Editor** → **New query** e cole todo o conteúdo de
   `supabase/migrations/20260820000001_initial_schema.sql`. Execute.
4. Em **Authentication → Providers**, garanta que Email está habilitado. Se
   quiser desativar confirmação por e-mail em dev, vá em **Authentication →
   Settings** e desmarque "Enable email confirmations".

### 2. Ambiente local

```bash
cp .env.example .env.local
# edite .env.local com as chaves do Supabase

npm install
npm run dev
```

Abra http://localhost:3000, crie uma conta e o template de categorias já vem
selecionado por padrão.

### 3. Deploy na Vercel

```bash
npx vercel
```

No dashboard da Vercel, adicione as três variáveis de ambiente:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL` — a URL final da Vercel (ex.: `https://norte.vercel.app`)

E no Supabase, em **Authentication → URL Configuration**, adicione a URL da
Vercel em **Site URL** e em **Redirect URLs**:
- `https://norte.vercel.app/auth/callback`

---

## Formatos de extrato aceitos (import)

### CSV
Reconhece cabeçalhos em PT-BR e EN. Coluna de data pode ser:
- `data`, `date`, `dt`, `data_lancamento`, `data_movimento`

Coluna de descrição:
- `descricao`, `description`, `historico`, `memo`, `estabelecimento`

Coluna de valor — uma das opções:
- Coluna única `valor` / `amount` (positivo = receita, negativo = despesa)
- Duas colunas: `debito` + `credito`

Datas aceitas: `dd/mm/yyyy`, `yyyy-mm-dd`, `dd-mm-yyyy`.
Valores: aceita `R$ 1.234,56`, `1234.56`, `1234,56`.

### OFX
Padrão SGML dos bancos brasileiros. Extrai `<STMTTRN>` com `<DTPOSTED>`,
`<TRNAMT>`, `<MEMO>`/`<NAME>`.

---

## Arquitetura

```
src/
├── app/
│   ├── (auth)/          — login, signup
│   ├── (app)/           — rotas protegidas (dashboard, transacoes, etc)
│   ├── auth/callback/   — OAuth/magic-link callback
│   └── page.tsx         — landing pública
├── components/
│   ├── ui/              — primitivos shadcn (Button, Card, Dialog, etc)
│   ├── dashboard/       — MonthSummary, CategoryBreakdown, RecentTransactions
│   └── nav.tsx          — sidebar/mobile-nav
├── actions/             — server actions (mutations)
├── lib/
│   ├── supabase/        — clients (browser, server, middleware)
│   ├── format.ts        — helpers BRL/PT-BR
│   ├── csv-parser.ts    — parser flexível de CSV
│   └── ofx-parser.ts    — parser OFX
├── types/database.ts    — tipagem manual do banco
└── middleware.ts        — proteção de rotas via Supabase auth
```

Server Components lêem direto do Supabase (via cookies do session). Mutations
passam por Server Actions com validação Zod. Nenhum endpoint REST manual — o
`@supabase/ssr` cuida do session refresh.

RLS garante que mesmo se um dev usasse a `anon key` no client, o Postgres só
devolve linhas do próprio usuário.

---

## Design system

Tokens em `src/app/globals.css` (CSS variables) + `tailwind.config.ts`.

**Cores** (light):
- `--background` `#f7f3ec` — papel cru quente
- `--primary` `#1e3a5f` — azul-tinta profundo
- `--positive` `#157a51` — verde profundo (não neon)
- `--destructive` `#b8331e` — vermelho terra

**Tipografia**:
- `--font-fraunces` — serif contemporâneo, para números grandes e headings
- `--font-inter` — sans utilitário, para body e UI

**Convenção**: números financeiros usam `tabular-nums` (classe `.num`) por padrão.
Sem isso vira caos visual.

---

## Licença

Uso privado. Feito por Arvanolix Solutions.
