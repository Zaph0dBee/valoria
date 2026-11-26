'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { formatMonthName } from '@/lib/format';

const ProfitSchema = z.object({
  profile_id: z.string().uuid(),
  amount: z.coerce.number().finite().positive(),
  occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Veio do botão da sugestão: não pode passar do que ainda está disponível. */
  suggested: z.boolean().optional(),
});

/** Registra a distribuição de lucro: transferência "lucros" da empresa para a PF. */
export async function registerProfitDistribution(input: {
  profile_id: string;
  amount: number;
  occurred_on: string;
  suggested?: boolean;
}): Promise<{ ok: true } | { error: string }> {
  const parsed = ProfitSchema.safeParse(input);
  if (!parsed.success) return { error: 'Dados inválidos' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Não autenticado' };

  const { data: profiles, error } = await supabase
    .from('financial_profiles')
    .select('id, kind, name, archived')
    .eq('user_id', user.id);
  if (error) return { error: error.message };
  const company = profiles?.find((p) => p.id === parsed.data.profile_id);
  const pf = profiles?.find((p) => p.kind === 'pf');
  if (!company || company.kind !== 'pj') return { error: 'Empresa não encontrada' };
  if (company.archived) return { error: 'Esta empresa está arquivada' };
  if (!pf) return { error: 'Perfil pessoal não encontrado' };

  const [y, m] = parsed.data.occurred_on.split('-').map(Number);

  // Checagem do disponível e gravação numa chamada só, com trava por empresa e mês:
  // cliques simultâneos em várias abas não registram o mesmo lucro duas vezes.
  const { error: rpcError } = await supabase.rpc('register_profit_distribution', {
    target_profile: company.id,
    profit_amount: parsed.data.amount,
    profit_date: parsed.data.occurred_on,
    profit_description: `Lucros de ${formatMonthName(m, y).toLowerCase()} · ${company.name}`,
    only_available: Boolean(parsed.data.suggested),
  });
  if (rpcError) return { error: rpcError.message };

  revalidatePath('/dashboard');
  revalidatePath('/transacoes');
  revalidatePath('/relatorios');
  return { ok: true };
}
