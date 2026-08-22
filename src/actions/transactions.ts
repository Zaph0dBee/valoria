'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';

const IdSchema = z.string().uuid();
const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida');

const TransactionSchema = z.object({
  occurred_on: DateSchema,
  amount: z.coerce.number().finite().positive(),
  kind: z.enum(['receita', 'despesa', 'reserva']),
  category_id: z.string().uuid().nullable().optional(),
  subcategory_id: z.string().uuid().nullable().optional(),
  reserve_id: z.string().uuid().nullable().optional(),
  description: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(500).optional().nullable(),
});

const TransactionUpdateSchema = TransactionSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'Nenhum campo para atualizar',
);

type TransactionInput = z.infer<typeof TransactionSchema>;
type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type RelationInput = Pick<TransactionInput, 'kind' | 'category_id' | 'subcategory_id' | 'reserve_id'>;

async function validateRelations(
  supabase: SupabaseClient,
  userId: string,
  input: RelationInput,
): Promise<string | null> {
  if (input.subcategory_id && !input.category_id) {
    return 'Selecione uma categoria antes da subcategoria';
  }

  if (input.category_id) {
    const { data: category, error } = await supabase
      .from('categories')
      .select('id, kind')
      .eq('id', input.category_id)
      .eq('user_id', userId)
      .eq('archived', false)
      .maybeSingle();

    if (error) return error.message;
    if (!category) return 'Categoria não encontrada';
    if (category.kind !== input.kind) return 'A categoria não corresponde ao tipo do lançamento';
  }

  if (input.subcategory_id && input.category_id) {
    const { data: subcategory, error } = await supabase
      .from('subcategories')
      .select('id')
      .eq('id', input.subcategory_id)
      .eq('category_id', input.category_id)
      .eq('user_id', userId)
      .eq('archived', false)
      .maybeSingle();

    if (error) return error.message;
    if (!subcategory) return 'Subcategoria não pertence à categoria selecionada';
  }

  if (input.reserve_id) {
    if (input.kind !== 'reserva') return 'Somente aportes podem ser vinculados a uma meta';

    const { data: reserve, error } = await supabase
      .from('reserves')
      .select('id')
      .eq('id', input.reserve_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) return error.message;
    if (!reserve) return 'Meta não encontrada';
  }

  return null;
}

export async function createTransaction(input: TransactionInput) {
  const parsed = TransactionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Dados inválidos', issues: parsed.error.flatten() };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Não autenticado' };

  const relationError = await validateRelations(supabase, user.id, parsed.data);
  if (relationError) return { error: relationError };

  const payload: Database['public']['Tables']['transactions']['Insert'] = {
    ...parsed.data,
    user_id: user.id,
    source: 'manual',
  };

  const { error } = await supabase.from('transactions').insert(payload);
  if (error) return { error: error.message };

  revalidatePath('/dashboard');
  revalidatePath('/transacoes');
  revalidatePath('/metas');
  return { ok: true };
}

export async function updateTransaction(
  id: string,
  input: Partial<TransactionInput>,
) {
  const parsedId = IdSchema.safeParse(id);
  const parsed = TransactionUpdateSchema.safeParse(input);
  if (!parsedId.success || !parsed.success) return { error: 'Dados inválidos' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Não autenticado' };

  const { data: existing, error: existingError } = await supabase
    .from('transactions')
    .select('kind, category_id, subcategory_id, reserve_id')
    .eq('id', parsedId.data)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existingError) return { error: existingError.message };
  if (!existing) return { error: 'Lançamento não encontrado' };

  const merged: RelationInput = {
    kind: parsed.data.kind ?? existing.kind,
    category_id:
      parsed.data.category_id !== undefined ? parsed.data.category_id : existing.category_id,
    subcategory_id:
      parsed.data.subcategory_id !== undefined
        ? parsed.data.subcategory_id
        : existing.subcategory_id,
    reserve_id:
      parsed.data.reserve_id !== undefined ? parsed.data.reserve_id : existing.reserve_id,
  };

  const relationError = await validateRelations(supabase, user.id, merged);
  if (relationError) return { error: relationError };

  const { error } = await supabase
    .from('transactions')
    .update(parsed.data)
    .eq('id', parsedId.data)
    .eq('user_id', user.id);

  if (error) return { error: error.message };
  revalidatePath('/dashboard');
  revalidatePath('/transacoes');
  revalidatePath('/metas');
  return { ok: true };
}

export async function deleteTransaction(id: string) {
  const parsedId = IdSchema.safeParse(id);
  if (!parsedId.success) return { error: 'Lançamento inválido' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Não autenticado' };

  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', parsedId.data)
    .eq('user_id', user.id);

  if (error) return { error: error.message };
  revalidatePath('/dashboard');
  revalidatePath('/transacoes');
  revalidatePath('/metas');
  return { ok: true };
}
