import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ValoriaMark, ValoriaLogo } from '@/components/brand/logo';

export default async function LandingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect('/dashboard');

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="container flex h-20 items-center justify-between">
        <ValoriaLogo className="h-7 text-primary" />
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Entrar</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/signup">Começar</Link>
          </Button>
        </div>
      </header>

      {/* Hero — direto do manual: Clareza que transforma. Domínio que gera liberdade. */}
      <section className="container pt-16 pb-24 md:pt-24 md:pb-32">
        <p className="eyebrow mb-8">consultoria financeira</p>

        <h1 className="font-display text-5xl md:text-7xl lg:text-8xl leading-[0.95] tracking-tight max-w-5xl">
          Clareza que transforma.
          <br />
          <span className="text-accent">Domínio</span> que gera
          <br />
          liberdade.
        </h1>

        <div className="mt-16 grid gap-16 md:grid-cols-[1fr,auto] md:items-end">
          <div className="max-w-xl">
            <p className="voice text-2xl leading-snug text-primary/90 mb-4">
              &ldquo;Aqui a gente organiza primeiro a cabeça, depois a planilha.&rdquo;
            </p>
            <p className="text-base leading-relaxed text-muted-foreground">
              A Valoria existe para tirar a confusão financeira do caminho e devolver
              a você o controle sobre suas próprias decisões. Não é milagre em 30 dias —
              é método, verdade e estratégia.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <Button asChild size="lg" className="text-base">
              <Link href="/signup">Começar agora</Link>
            </Button>
            <span className="text-xs text-muted-foreground text-center">
              importa CSV/OFX · categorias suas · sem cartão
            </span>
          </div>
        </div>
      </section>

      <div className="rule container" />

      {/* Três pilares — direto do manual */}
      <section className="container py-24">
        <p className="eyebrow mb-3">pilares da essência</p>
        <h2 className="font-display text-3xl md:text-4xl max-w-2xl mb-16">
          Três passos para uma vida financeira alinhada ao que realmente importa.
        </h2>

        <div className="grid gap-10 md:grid-cols-3 md:gap-16">
          <Pillar
            number="01"
            title="Clareza"
            body="Enxergar a própria realidade financeira sem ilusão. Cada real que entra, cada real que sai, na tela — sem filtro, sem racionalização."
          />
          <Pillar
            number="02"
            title="Domínio"
            body="Assumir o comando das decisões e da rotina financeira. Categorias suas, metas suas, ritmo seu."
          />
          <Pillar
            number="03"
            title="Liberdade"
            body="Construir uma vida financeira alinhada ao propósito. Não é sobre ter mais — é sobre saber para onde vai."
          />
        </div>
      </section>

      <div className="rule container" />

      {/* Prova / diferencial */}
      <section className="container py-24">
        <div className="grid gap-12 md:grid-cols-2 md:gap-16 items-start">
          <div>
            <p className="eyebrow mb-3">o que você tem</p>
            <h3 className="font-display text-3xl md:text-4xl mb-6">
              Não é planilha. É a versão dela que aprende com você.
            </h3>
          </div>
          <div className="space-y-6">
            <Feature
              title="Painel mensal"
              body="Um número grande no topo. Quanto entrou, quanto saiu, o que sobrou, comparado ao mês anterior. Sem gráfico decorativo."
            />
            <Feature
              title="Categorias suas"
              body="Comece com o template clássico ou apague tudo e crie do zero. A taxonomia é sua, porque a vida é sua."
            />
            <Feature
              title="Import de extrato"
              body="CSV do banco, arquivo OFX, ou lançamento manual. O sistema reconhece os formatos comuns e você revisa antes de salvar."
            />
            <Feature
              title="Metas com propósito"
              body="Reserva de emergência, viagem, casa. Cada meta com progresso, prazo e cor. Botões rápidos de aporte."
            />
          </div>
        </div>
      </section>

      <footer className="rule container" />
      <div className="container flex h-20 items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <ValoriaMark className="h-5 text-primary" />
          <span>Valoria Consultoria Financeira · {new Date().getFullYear()}</span>
        </div>
        <span>método antes de motivação</span>
      </div>
    </div>
  );
}

function Pillar({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <div>
      <p className="eyebrow mb-4">{number}</p>
      <h3 className="font-display text-4xl mb-4 text-primary">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-l-2 border-accent/40 pl-5">
      <h4 className="font-display text-xl mb-1.5">{title}</h4>
      <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}
