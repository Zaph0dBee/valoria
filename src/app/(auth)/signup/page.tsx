import Link from 'next/link';
import { SignupForm } from './signup-form';
import { ValoriaLogo } from '@/components/brand/logo';

export const dynamic = 'force-dynamic';

export default function SignupPage() {
  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="hidden md:flex flex-col justify-between bg-primary text-primary-foreground p-12">
        <Link href="/" className="inline-block">
          <ValoriaLogo className="h-7 text-primary-foreground" />
        </Link>
        <div>
          <p className="eyebrow mb-6 text-accent">começar</p>
          <p className="voice text-3xl leading-tight text-primary-foreground/95">
            Cria a conta, escolhe as categorias, começa a lançar.
            <br />
            <span className="text-accent">Três minutos.</span>
          </p>
          <div className="mt-6 h-px w-16 bg-accent" />
        </div>
      </div>

      <div className="flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-sm">
          <Link href="/" className="md:hidden inline-block mb-10">
            <ValoriaLogo className="h-7 text-primary" />
          </Link>
          <p className="eyebrow mb-3">primeira vez aqui</p>
          <h1 className="font-display text-4xl mb-2">Criar conta</h1>
          <p className="text-sm text-muted-foreground mb-8">
            Sem cartão. Sem trial. Sem enrolação.
          </p>
          <SignupForm />
          <p className="mt-8 text-sm text-muted-foreground">
            Já tem conta?{' '}
            <Link href="/login" className="text-primary font-medium underline-offset-4 hover:underline">
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
