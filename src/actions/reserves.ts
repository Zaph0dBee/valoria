'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const IdSchema = z.string().uuid();
const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();

const ReserveSchema = z.object({
  name: z.string().trim().min(1).max(100),
  target_amount: z.coerce.number().finite().positive(),
  starting_amount: z.coerce.number().finite().min(0).default(0),
  target_date: DateSchema,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#1e3a5f'),
});

export async function createReserve(input: z.infer<typeof ReserveSchema>) {
  const parsed = ReserveSchema.safeParse(input);
  if (!parsed.success) return { error: 'Dados inválidos' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Não autenticado' };

  const { error } = await supabase
    .from('reserves')
    .insert({
      ...parsed.data,
      current_amount: parsed.data.starting_amount,
      user_id: user.id,
    });

  if (error) return { error: error.message };
  revalidatePath('/metas');
  revalidatePath('/dashboard');
  revalidatePath('/transacoes');
  return { ok: true };
}

export async function updateReserveStartingAmount(id: string, startingAmount: number) {
  const parsedId = IdSchema.safeParse(id);
  const parsedAmount = z.coerce.number().finite().min(0).safeParse(startingAmount);
  if (!parsedId.success || !parsedAmount.success) return { error: 'Dados inválidos' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Não autenticado' };

  const { error } = await supabase
    .from('reserves')
    .update({ starting_amount: parsedAmount.data })
    .eq('id', parsedId.data)
    .eq('user_id', user.id);

  if (error) return { error: error.message };
  revalidatePath('/metas');
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function archiveReserve(id: string) {
  const parsedId = IdSchema.safeParse(id);
  if (!parsedId.success) return { error: 'Meta inválida' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Não autenticado' };

  const { error } = await supabase
    .from('reserves')
    .update({ archived: true })
    .eq('id', parsedId.data)
    .eq('user_id', user.id);

  if (error) return { error: error.message };
  revalidatePath('/metas');
  revalidatePath('/dashboard');
  revalidatePath('/transacoes');
  return { ok: true };
}
