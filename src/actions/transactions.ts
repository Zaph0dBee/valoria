'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const TransactionSchema = z.object({
  occurred_on: z.string().min(1),
  amount: z.coerce.number().positive(),
  kind: z.enum(['receita', 'despesa', 'reserva']),
  category_id: z.string().uuid().nullable().optional(),
  subcategory_id: z.string().uuid().nullable().optional(),
  description: z.string().min(1).max(200),
  notes: z.string().max(500).optional().nullable(),
});

export async function createTransaction(input: z.infer<typeof TransactionSchema>) {
  const parsed = TransactionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Dados inválidos', issues: parsed.error.flatten() };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Não autenticado' };

  const { error } = await supabase
    .from('transactions')
    .insert({ ...parsed.data, user_id: user.id, source: 'manual' });

  if (error) return { error: error.message };

  revalidatePath('/dashboard');
  revalidatePath('/transacoes');
  return { ok: true };
}

export async function updateTransaction(id: string, input: Partial<z.infer<typeof TransactionSchema>>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Não autenticado' };

  const { error } = await supabase
    .from('transactions')
    .update(input)
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return { error: error.message };
  revalidatePath('/dashboard');
  revalidatePath('/transacoes');
  return { ok: true };
}

export async function deleteTransaction(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Não autenticado' };

  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return { error: error.message };
  revalidatePath('/dashboard');
  revalidatePath('/transacoes');
  return { ok: true };
}
