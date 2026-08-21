# Guia de instalação — Norte

Do zero até o app no ar. Tempo total estimado: **~30 minutos** se tudo der certo
no primeiro pulo.

---

## Pré-requisitos

Antes de começar, garante que você tem:

- [ ] **Node.js 20+** instalado (`node -v` no terminal deve mostrar `v20.x` ou maior)
  → se não tiver: https://nodejs.org (baixa a versão LTS)
- [ ] **Git** instalado (`git --version`)
- [ ] Uma conta no **Supabase** (grátis) — https://supabase.com
- [ ] Uma conta na **Vercel** (grátis) — https://vercel.com — só pra depois, no deploy
- [ ] Um editor de código — recomendo **VS Code** — https://code.visualstudio.com

Nada disso precisa cartão de crédito no plano free.

---

## Parte 1 — Preparar os arquivos (2 min)

### 1.1 Extrair o zip

Baixa o `norte.zip` que te enviei e extrai. Vai criar uma pasta `norte/` com
tudo dentro.

Recomendo colocar em algum lugar organizado, tipo:

```
~/projetos/norte/
```

### 1.2 Abrir no editor

Abre a pasta no VS Code:

```bash
cd ~/projetos/norte
code .
```

---

## Parte 2 — Criar o projeto no Supabase (5 min)

### 2.1 Criar o projeto

1. Entra em https://supabase.com/dashboard
2. Clica em **New project**
3. Escolhe uma organização (ou cria uma nova, tipo "Arvanolix")
4. Preenche:
   - **Name**: `norte` (ou o nome que quiser)
   - **Database Password**: **gera uma senha forte e SALVA num gerenciador**. Você
     vai precisar depois se for mexer no banco via ferramentas externas.
   - **Region**: `South America (São Paulo)` — mais próximo, mais rápido
   - **Pricing Plan**: Free
5. Clica em **Create new project** e espera ~1 minuto o projeto provisionar.

### 2.2 Rodar o schema SQL

Assim que o projeto estiver pronto:

1. Na sidebar esquerda, clica em **SQL Editor** (ícone de banco de dados com `>_`)
2. Clica em **New query** (canto superior direito)
3. Abre o arquivo `supabase/migrations/20260820000001_initial_schema.sql`
   (na pasta do projeto que você extraiu) e **copia tudo**
4. Cola no SQL Editor do Supabase
5. Clica em **Run** (ou aperta `Ctrl+Enter` / `Cmd+Enter`)

Se aparecer "Success. No rows returned" — deu certo. Ignora warnings amarelos.

Se der **erro**, provavelmente é porque você já rodou uma vez. Nesse caso, roda
antes:

```sql
drop schema public cascade;
create schema public;
```

E depois roda o schema de novo.

### 2.3 Pegar as chaves de API

1. Na sidebar, clica em **Project Settings** (engrenagem no canto inferior esquerdo)
2. Vai em **API**
3. Você vai ver duas coisas que interessam:
   - **Project URL** (algo como `https://abcxyz.supabase.co`) → copia
   - **Project API keys → anon public** (uma string longa começando com `eyJ...`) → copia

Deixa essa aba aberta, vamos usar já.

### 2.4 (Opcional) Desativar confirmação de e-mail em dev

Pra não precisar confirmar e-mail toda vez que criar uma conta de teste:

1. Ainda em **Authentication** (na sidebar) → **Providers** → **Email**
2. Desmarca **Confirm email**
3. Salva

⚠️ Em produção, deixa ligado. Isso é só pra facilitar teste local.

---

## Parte 3 — Rodar localmente (5 min)

### 3.1 Configurar variáveis de ambiente

Na pasta do projeto, copia o `.env.example` pra `.env.local`:

```bash
cp .env.example .env.local
```

Abre o `.env.local` no editor e preenche:

```env
NEXT_PUBLIC_SUPABASE_URL=https://abcxyz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Cola os valores que você copiou do Supabase.

### 3.2 Instalar dependências

No terminal, dentro da pasta do projeto:

```bash
npm install
```

Vai baixar ~200MB de node_modules. Espera de 1 a 3 minutos dependendo da sua
internet.

### 3.3 Rodar o servidor de dev

```bash
npm run dev
```

Deve aparecer algo assim:

```
▲ Next.js 15.1.3
- Local:        http://localhost:3000
- Environments: .env.local

✓ Ready in 2.1s
```

Abre http://localhost:3000 no navegador. Você vai ver a landing do Norte.

---

## Parte 4 — Primeiro teste (3 min)

### 4.1 Criar conta

1. Na landing, clica em **Criar conta**
2. Preenche nome, e-mail (pode ser um de teste), senha (8+ caracteres)
3. **Deixa marcado** o "Começar com o template da planilha clássica" — isso já
   cria as 10 categorias e subcategorias
4. Clica em **Criar conta**

Se você desativou confirmação de e-mail (passo 2.4), vai direto pro dashboard.

Se não desativou, vai ver "Confirme seu e-mail" — vai no e-mail, clica no link,
e depois faz login.

### 4.2 Ver o dashboard

Você vai cair no `/dashboard`. Como não tem lançamento ainda, tudo vai estar
zerado. Isso é esperado.

### 4.3 Criar o primeiro lançamento

1. Clica em **Novo lançamento** (canto superior direito ou "Adicionar o primeiro")
2. Escolhe **Despesa**
3. Preenche data, valor (tipo `234,50`), descrição (tipo `Supermercado`),
   categoria (`Alimentação`), subcategoria (`Supermercado`)
4. Clica em **Salvar**

Volta pro dashboard. Agora você deve ver:
- O saldo do mês em vermelho (`-R$ 234,50`)
- A barra de composição com a fatia de despesa
- Alimentação aparecendo no breakdown por categoria
- O lançamento na lista de "Últimos lançamentos"

**Se tudo isso apareceu, o sistema tá funcionando** 🎉

### 4.4 Testar o import CSV (opcional)

Se você quiser testar o import agora, cria um `teste.csv` num editor de texto
com esse conteúdo:

```csv
data,descricao,valor
20/08/2026,Padaria da esquina,-18.50
19/08/2026,Salário empresa,5000.00
18/08/2026,Uber pra reunião,-32.00
17/08/2026,Café com cliente,-45.00
```

Salva, vai em **Importar** no menu, escolhe o arquivo. Você vai ver os 4
lançamentos reconhecidos, com o Norte inferindo receita/despesa pelo sinal do
valor. Ajusta as categorias e clica em **Importar 4**.

---

## Parte 5 — Deploy na Vercel (10 min)

Só faz essa parte quando o local estiver funcionando.

### 5.1 Colocar o código no Git

```bash
cd ~/projetos/norte
git init
git add .
git commit -m "Norte v1"
```

Cria um repositório privado no GitHub (https://github.com/new), sem README
(porque já temos), e depois:

```bash
git remote add origin https://github.com/seu-usuario/norte.git
git branch -M main
git push -u origin main
```

### 5.2 Importar na Vercel

1. Entra em https://vercel.com/new
2. Clica em **Import Git Repository**
3. Autoriza a Vercel a ver seus repos (se for a primeira vez)
4. Escolhe o repo `norte` e clica **Import**
5. Na tela de configuração:
   - **Framework Preset**: Next.js (detecta sozinho)
   - **Root Directory**: `./` (padrão)
   - Expande **Environment Variables** e adiciona **as 3 chaves**:
     - `NEXT_PUBLIC_SUPABASE_URL` → cola a URL do Supabase
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → cola a anon key
     - `NEXT_PUBLIC_SITE_URL` → **deixa em branco por enquanto**, você atualiza
       depois com a URL real
6. Clica **Deploy** e espera ~2 minutos.

### 5.3 Atualizar a SITE_URL

Depois do deploy, a Vercel te dá uma URL tipo `https://norte-xxx.vercel.app`.

1. Copia essa URL
2. Vai em **Settings** → **Environment Variables** no dashboard Vercel
3. Edita `NEXT_PUBLIC_SITE_URL` e cola a URL da Vercel (sem barra no final)
4. Vai em **Deployments** → nos três pontinhos do último deploy → **Redeploy**

### 5.4 Configurar auth no Supabase pra produção

Isso é **essencial** — se pular, o signup vai quebrar em produção:

1. No Supabase, vai em **Authentication** → **URL Configuration**
2. **Site URL**: cola a URL da Vercel (ex.: `https://norte-xxx.vercel.app`)
3. **Redirect URLs**: adiciona duas linhas:
   - `https://norte-xxx.vercel.app/**`
   - `http://localhost:3000/**` (pra continuar funcionando local)
4. Salva

Pronto. Abre a URL da Vercel e testa criar conta lá.

---

## Parte 6 — Comprar domínio próprio (opcional, 5 min)

Se quiser um domínio próprio tipo `norte.com.br` ou algo assim:

1. Compra o domínio na GoDaddy (você já tem conta) ou Registro.br
2. Na Vercel: **Settings** → **Domains** → **Add** → digita seu domínio
3. Vercel te dá 2 opções de configuração DNS — segue as instruções
4. Aponta o DNS no painel do registrador
5. Espera propagar (5 min a 2 horas)
6. **Atualiza também** o `NEXT_PUBLIC_SITE_URL` e as **Redirect URLs** do
   Supabase pro domínio novo

---

## Troubleshooting comum

### "Invalid login credentials" ao criar conta
- Você provavelmente esqueceu de rodar o schema SQL, ou rodou incompleto.
  Volta no passo 2.2.
- Se você **ativou** confirmação de e-mail, precisa clicar no link do e-mail antes
  de conseguir logar.

### Dashboard fica em branco / erro 500
- Confirma que as 3 variáveis de ambiente estão certinhas (sem espaço extra, com
  `https://` na URL)
- Confirma que a `anon key` é a **anon public**, não a `service_role`

### Import CSV não reconhece as colunas
- Abre o CSV num editor de texto e vê se a **primeira linha** tem cabeçalho.
  Alguns bancos exportam com metadados nas primeiras linhas — apaga essas linhas
  e deixa só cabeçalho + dados.
- Nomes de coluna aceitos: veja seção "Formatos aceitos" no README.md

### `npm install` dá erro
- Deleta `node_modules` e `package-lock.json`, roda `npm install` de novo
- Confirma que Node é 20+ (`node -v`)

### Deploy Vercel dá erro de TypeScript
- Provavelmente algum tipo. Roda `npm run build` local pra ver o erro exato.
  Se travar em algo específico, me manda o log.

### Auth funciona local mas quebra em prod
- Você esqueceu de configurar **Site URL** e **Redirect URLs** no Supabase
  (passo 5.4). É o erro mais comum.

---

## O que fazer depois

Assim que estiver rodando e você tiver usado por uns dias:

1. **Feedback de uso real** — anota o que incomoda, o que falta. Feature no v2
   sai do uso real, não do brainstorm.
2. **Nome definitivo** — "Norte" é provisório. Se pensou em outro, é só trocar
   nas strings do `layout.tsx`, `nav.tsx`, `page.tsx` e `README.md`. Simples
   find-and-replace.
3. **Convidar 3-5 pessoas próximas** pra testar. Feedback delas vale mais que
   qualquer research.
4. **Billing** — quando bater o momento certo, integramos Stripe. Já preparei
   a arquitetura pra isso (auth multi-tenant, RLS por usuário).

---

## Custos

- **Supabase Free**: aguenta ~50 mil usuários com uso leve. Free até 500MB de DB
  e 2GB de bandwidth.
- **Vercel Hobby**: grátis pra uso pessoal e projetos comerciais pequenos. Se
  você abrir como SaaS pago, aí precisa migrar pro Pro ($20/mês).
- **Domínio**: R$ 40-50/ano em `.com.br`, ~R$ 60-80/ano em `.com`.

Total pra começar: **R$ 0**.

---

Qualquer coisa emperrar, me chama que a gente resolve.
