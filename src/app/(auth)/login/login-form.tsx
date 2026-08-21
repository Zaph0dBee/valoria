'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toaster';

export function LoginForm() {
  const [loading, setLoading] = React.useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = e.currentTarget;
    const email = (form.elements.namedItem('email') as HTMLInputElement).value;
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      toast({
        variant: 'destructive',
        title: 'Não deu para entrar',
        description: error.message === 'Invalid login credentials'
          ? 'E-mail ou senha incorretos.'
          : error.message,
      });
      setLoading(false);
      return;
    }

    // Pega o ?next=... direto do URL — sem useSearchParams
    const params = new URLSearchParams(window.location.search);
    const next = params.get('next') || '/dashboard';
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Senha</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Entrando…' : 'Entrar'}
      </Button>
    </form>
  );
}