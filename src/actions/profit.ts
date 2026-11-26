'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createTransaction } from '@/actions/transactions';
import { formatMonthName } from '@/lib/format';

const ProfitSchema = z.object({
  profile_id: z.string().uuid(),
  amount: z.coerce.number().finite().positive(),
  occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Registra a distribuição de lucro: transferência "lucros" da empresa para a PF. */
export async function registerProfitDistribution(input: {
  profile_id: string;
  amount: number;
  occurred_on: string;
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
  const res = await createTransaction({
    profile_id: company.id,
    occurred_on: parsed.data.occurred_on,
    amount: parsed.data.amount,
    kind: 'transferencia',
    description: `Lucros de ${formatMonthName(m, y).toLowerCase()} · ${company.name}`,
    counterpart_profile_id: pf.id,
    transfer_reason: 'lucros',
  });
  if ('error' in res && res.error) return { error: res.error };
  return { ok: true };
}
