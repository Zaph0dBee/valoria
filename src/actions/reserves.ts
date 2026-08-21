'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const ReserveSchema = z.object({
  name: z.string().min(1).max(100),
  target_amount: z.coerce.number().positive(),
  current_amount: z.coerce.number().min(0).default(0),
  target_date: z.string().nullable().optional(),
  color: z.string().default('#1e3a5f'),
});

export async function createReserve(input: z.infer<typeof ReserveSchema>) {
  const parsed = ReserveSchema.safeParse(input);
  if (!parsed.success) return { error: 'Dados inválidos' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Não autenticado' };

  const { error } = await supabase
    .from('reserves')
    .insert({ ...parsed.data, user_id: user.id });

  if (error) return { error: error.message };
  revalidatePath('/metas');
  return { ok: true };
}

export async function updateReserveAmount(id: string, current_amount: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Não autenticado' };

  const { error } = await supabase
    .from('reserves')
    .update({ current_amount })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return { error: error.message };
  revalidatePath('/metas');
  return { ok: true };
}

export async function archiveReserve(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Não autenticado' };

  const { error } = await supabase
    .from('reserves')
    .update({ archived: true })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return { error: error.message };
  revalidatePath('/metas');
  return { ok: true };
}
