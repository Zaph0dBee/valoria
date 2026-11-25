'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const OpeningBalanceSchema = z.object({
  profile_id: z.string().uuid(),
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  opening_balance: z.coerce.number().finite().min(-999999999999).max(999999999999),
});

async function checkActiveProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('financial_profiles')
    .select('id, archived')
    .eq('id', profileId)
    .maybeSingle();
  if (error) return error.message;
  if (!data) return 'Perfil não encontrado';
  if (data.archived) return 'Este perfil está arquivado';
  return null;
}

export async function setMonthlyOpeningBalance(input: z.infer<typeof OpeningBalanceSchema>) {
  const parsed = OpeningBalanceSchema.safeParse(input);
  if (!parsed.success) return { error: 'Saldo inicial inválido' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Não autenticado' };

  const profileError = await checkActiveProfile(supabase, parsed.data.profile_id);
  if (profileError) return { error: profileError };

  const { error } = await supabase
    .from('monthly_balances')
    .upsert(
      {
        user_id: user.id,
        profile_id: parsed.data.profile_id,
        year: parsed.data.year,
        month: parsed.data.month,
        opening_balance: parsed.data.opening_balance,
      },
      { onConflict: 'profile_id,year,month' },
    );

  if (error) return { error: error.message };

  revalidatePath('/dashboard');
  return { ok: true };
}

export async function removeMonthlyOpeningBalance(year: number, month: number, profileId: string) {
  const parsed = OpeningBalanceSchema.pick({ year: true, month: true, profile_id: true })
    .safeParse({ year, month, profile_id: profileId });
  if (!parsed.success) return { error: 'Período inválido' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Não autenticado' };

  const { error } = await supabase
    .from('monthly_balances')
    .delete()
    .eq('user_id', user.id)
    .eq('profile_id', parsed.data.profile_id)
    .eq('year', parsed.data.year)
    .eq('month', parsed.data.month);

  if (error) return { error: error.message };

  revalidatePath('/dashboard');
  return { ok: true };
}
