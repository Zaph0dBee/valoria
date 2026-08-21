'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toaster';

export function SignupForm() {
  const [loading, setLoading] = React.useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = e.currentTarget;
    const fullName = (form.elements.namedItem('fullName') as HTMLInputElement).value;
    const email = (form.elements.namedItem('email') as HTMLInputElement).value;
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;
    const useTemplate = (form.elements.namedItem('template') as HTMLInputElement).checked;

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/auth/callback?template=${useTemplate}`,
      },
    });

    if (error) {
      toast({
        variant: 'destructive',
        title: 'Não deu para criar a conta',
        description: error.message,
      });
      setLoading(false);
      return;
    }

    if (data.session) {
      // E-mail confirmation desativada — logado direto
      if (useTemplate) {
        await supabase.rpc('seed_default_categories', { target_user: data.user!.id });
      }
      router.push('/dashboard');
      router.refresh();
    } else {
      toast({
        title: 'Confirme seu e-mail',
        description: 'Enviamos um link de confirmação. Clique nele para entrar.',
      });
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="fullName">Seu nome</Label>
        <Input id="fullName" name="fullName" type="text" autoComplete="name" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Senha (mínimo 8 caracteres)</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <label className="flex items-start gap-2 text-sm pt-2 cursor-pointer">
        <input
          type="checkbox"
          id="template"
          name="template"
          defaultChecked
          className="mt-1 h-4 w-4 rounded border-input accent-primary"
        />
        <span className="text-muted-foreground">
          Começar com o template da planilha clássica (10 categorias, subcategorias comuns). Você pode editar tudo depois.
        </span>
      </label>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Criando…' : 'Criar conta'}
      </Button>
    </form>
  );
}
