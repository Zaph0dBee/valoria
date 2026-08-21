import { LoginForm } from './login-form';
import Link from 'next/link';
import { ValoriaLogo, ValoriaMark } from '@/components/brand/logo';

export default function LoginPage() {
  return (
    <div className="min-h-screen grid md:grid-cols-2">
      {/* Painel visual esquerdo — verde floresta */}
      <div className="hidden md:flex flex-col justify-between bg-primary text-primary-foreground p-12">
        <Link href="/" className="inline-block">
          <ValoriaLogo className="h-7 text-primary-foreground" />
        </Link>
        <div>
          <p className="eyebrow mb-6 text-accent">agosto · 2026</p>
          <p className="voice text-3xl leading-tight text-primary-foreground/95">
            &ldquo;Cada aplicação da marca é uma oportunidade de honrar as conexões
            que ela representa.&rdquo;
          </p>
          <div className="mt-6 h-px w-16 bg-accent" />
        </div>
      </div>

      {/* Form direito */}
      <div className="flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-sm">
          <Link href="/" className="md:hidden inline-block mb-10">
            <ValoriaLogo className="h-7 text-primary" />
          </Link>
          <p className="eyebrow mb-3">bem-vinda de volta</p>
          <h1 className="font-display text-4xl mb-2">Entrar</h1>
          <p className="text-sm text-muted-foreground mb-8">
            Seus lançamentos, categorias e metas estão esperando.
          </p>
          <LoginForm />
          <p className="mt-8 text-sm text-muted-foreground">
            Ainda não tem conta?{' '}
            <Link href="/signup" className="text-primary font-medium underline-offset-4 hover:underline">
              Criar conta
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
