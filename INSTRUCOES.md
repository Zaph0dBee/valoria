# Atualização: Norte → Valoria

Este pacote substitui a identidade **Norte** (provisória) pela identidade **Valoria**
oficial: nome, paleta (verde floresta + dourado fosco + marfin), tipografia
(Cormorant Garamond + Caladea + Montserrat), símbolo (galho com folhas + estrela).

O banco de dados, autenticação e funcionalidades **não mudam** — nada precisa ser
refeito no Supabase.

---

## Como aplicar (2 minutos)

### 1. Para o servidor

No terminal onde o `npm run dev` tá rodando, aperta `Ctrl+C`.

### 2. Descompacta este zip

Extrai `valoria-update.zip` — vai criar uma pasta `valoria-update` com a mesma
estrutura interna do projeto (`src/`, `tailwind.config.ts`).

### 3. Copia os arquivos por cima do projeto

**Opção fácil (Windows Explorer):**
1. Abre a pasta `valoria-update` extraída
2. Seleciona **tudo dentro dela** (`Ctrl+A`)
3. Copia (`Ctrl+C`)
4. Cola na pasta `norte` (`Ctrl+V`)
5. Quando o Windows perguntar "substituir arquivos existentes?", clica em
   **"Substituir os arquivos no destino"**

**Opção terminal (PowerShell, dentro da pasta `norte`):**
```powershell
Copy-Item -Path "..\valoria-update\*" -Destination "." -Recurse -Force
```

### 4. Sobe o servidor de novo

```powershell
npm run dev
```

Abre http://localhost:3000 no navegador. Se já tava aberto, aperta `Ctrl+Shift+R`
pra forçar reload (limpa cache).

**Você deve ver a nova landing** — fundo marfin, tipografia serif elegante,
símbolo da folha com galho, verde floresta e dourado.

---

## O que foi alterado

Arquivos substituídos:

- `src/app/globals.css` — paleta oficial em CSS variables
- `src/app/layout.tsx` — fontes Cormorant Garamond + Caladea + Montserrat via `next/font`
- `src/app/page.tsx` — landing com hero "Clareza que transforma. Domínio que gera liberdade.", 3 pilares
- `src/app/(auth)/login/page.tsx` — copy adaptada
- `src/app/(auth)/signup/page.tsx` — copy adaptada
- `src/app/(app)/dashboard/page.tsx` — saudação com nome + tom da marca
- `src/components/nav.tsx` — logo Valoria no menu
- `tailwind.config.ts` — fontes atualizadas + adição de cor `reserve` (dourado)

Arquivo novo:

- `src/components/brand/logo.tsx` — símbolo em SVG (`<ValoriaMark />`) e marca
  completa (`<ValoriaLogo />`). Usam `currentColor` para herdar a cor do
  container — dá pra pintar em verde, dourado, marfin, o que precisar.

O que **NÃO** mudou (continua funcionando igual):

- Schema Supabase e migrations
- Server actions (transações, categorias, metas, imports)
- Componentes shadcn/ui de base (Button, Card, Input, Table, etc)
- Parser CSV/OFX
- Middleware de auth
- `.env.local` — suas chaves continuam válidas

---

## Onde encontrar cada elemento da marca no código

**Cores** — `src/app/globals.css`:
- `--primary` = Verde Floresta `#0A2E20`
- `--accent` = Dourado Fosco `#B99154`
- `--background` = Marfin `#F0E7D8`
- `--paper` = Marfin um tom mais quente (usado no sidebar)
- `--secondary` = Verde Sálvia `#9FA88A`
- `--destructive` = Vermelho tijolo (para despesas)
- `--positive` = Verde escuro (para receitas)
- `--reserve` = Dourado (para metas/reservas)

**Fontes** — `src/app/layout.tsx` e `tailwind.config.ts`:
- `font-display` = Cormorant Garamond (títulos, número do saldo)
- `font-sans` = Montserrat (body, botões, UI)
- `font-voice` (via classe `.voice`) = Caladea italic (citações da marca)

**Símbolo** — `src/components/brand/logo.tsx`:
- `<ValoriaMark className="h-8 text-primary" />` — só o símbolo
- `<ValoriaLogo className="h-6 text-primary" />` — símbolo + wordmark

**Eyebrow** — classe `.eyebrow` no CSS (uppercase, tracking largo, dourado)

**Voz da marca** — classe `.voice` (Caladea italic — usar em citações e
frases-conceito, tipo o "Aqui a gente organiza primeiro a cabeça").

---

## Se algo der errado

**"Cannot find module '@/components/brand/logo'"** — o arquivo
`src/components/brand/logo.tsx` não foi copiado. Verifica se a pasta `brand/`
existe dentro de `src/components/`.

**Fontes não carregam** — deleta a pasta `.next/` (cache do Next.js) e roda
`npm run dev` de novo:
```powershell
Remove-Item -Recurse -Force .next
npm run dev
```

**Página aparece "Norte" em algum lugar** — pode ter arquivo que não peguei nesta
passada (README, GUIA_INSTALACAO.md, etc). Me avisa que atualizo.

**Tudo aparece sem cor / com estilo padrão** — provavelmente o
`tailwind.config.ts` não foi substituído. Confirma que ele foi copiado.
