'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';

const IdSchema = z.string().uuid();
const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida');

const TransactionSchema = z.object({
  profile_id: IdSchema,
  occurred_on: DateSchema,
  amount: z.coerce.number().finite().positive(),
  kind: z.enum(['receita', 'despesa', 'reserva', 'transferencia']),
  category_id: z.string().uuid().nullable().optional(),
  subcategory_id: z.string().uuid().nullable().optional(),
  reserve_id: z.string().uuid().nullable().optional(),
  description: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(500).optional().nullable(),
  counterpart_profile_id: IdSchema.nullable().optional(),
  transfer_reason: z.enum(['pro_labore', 'lucros', 'aporte_capital', 'outro']).nullable().optional(),
});

const TransactionUpdateSchema = TransactionSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'Nenhum campo para atualizar',
);

type TransactionInput = z.infer<typeof TransactionSchema>;
type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type RelationInput = Pick<
  TransactionInput,
  'profile_id' | 'kind' | 'category_id' | 'subcategory_id' | 'reserve_id' | 'counterpart_profile_id' | 'transfer_reason'
>;

async function validateRelations(
  supabase: SupabaseClient,
  userId: string,
  input: RelationInput,
  options: { allowArchivedProfile?: boolean; allowArchivedCounterpart?: boolean } = {},
): Promise<string | null> {
  if (input.subcategory_id && !input.category_id) {
    return 'Selecione uma categoria antes da subcategoria';
  }

  const { data: profile, error: profileError } = await supabase
    .from('financial_profiles')
    .select('id, kind, archived')
    .eq('id', input.profile_id)
    .eq('user_id', userId)
    .maybeSingle();
  if (profileError) return profileError.message;
  if (!profile) return 'Perfil não encontrado';
  if (profile.archived && !options.allowArchivedProfile) {
    return 'Este perfil está arquivado. Reative a empresa para lançar nela.';
  }
  if (profile.kind === 'pj' && input.kind === 'reserva') {
    return 'Empresas não fazem aporte em metas. Transfira para a PF primeiro.';
  }

  if (input.kind === 'transferencia') {
    if (!input.counterpart_profile_id) return 'Escolha para qual perfil vai a transferência';
    if (!input.transfer_reason) return 'Escolha o motivo da transferência';
    if (input.counterpart_profile_id === input.profile_id) return 'Origem e destino precisam ser perfis diferentes';
    if (input.category_id || input.subcategory_id || input.reserve_id) {
      return 'Transferência não tem categoria nem meta';
    }
    const { data: counterpart, error: counterpartError } = await supabase
      .from('financial_profiles')
      .select('id, kind, archived')
      .eq('id', input.counterpart_profile_id)
      .eq('user_id', userId)
      .maybeSingle();
    if (counterpartError) return counterpartError.message;
    if (!counterpart) return 'Perfil de destino inválido';
    if (counterpart.archived && !options.allowArchivedCounterpart) return 'O perfil de destino está arquivado';
    if (['pro_labore', 'lucros'].includes(input.transfer_reason) && !(profile.kind === 'pj' && counterpart.kind === 'pf')) {
      return 'Pró-labore e lucros vão da empresa para a PF';
    }
    if (input.transfer_reason === 'aporte_capital' && !(profile.kind === 'pf' && counterpart.kind === 'pj')) {
      return 'Aporte de capital vai da PF para a empresa';
    }
    return null;
  }
  if (input.counterpart_profile_id || input.transfer_reason) {
    return 'Só transferências têm perfil de destino';
  }

  if (input.category_id) {
    const { data: category, error } = await supabase
      .from('categories')
      .select('id, kind, profile_id')
      .eq('id', input.category_id)
      .eq('user_id', userId)
      .eq('archived', false)
      .maybeSingle();

    if (error) return error.message;
    if (!category) return 'Categoria não encontrada';
    if (category.kind !== input.kind) return 'A categoria não corresponde ao tipo do lançamento';
    if (category.profile_id !== input.profile_id) return 'A categoria pertence a outro perfil';
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
    .select('profile_id, kind, category_id, subcategory_id, reserve_id, counterpart_profile_id, transfer_reason')
    .eq('id', parsedId.data)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existingError) return { error: existingError.message };
  if (!existing) return { error: 'Lançamento não encontrado' };

  const merged: RelationInput = {
    profile_id: parsed.data.profile_id ?? existing.profile_id,
    counterpart_profile_id:
      parsed.data.counterpart_profile_id !== undefined
        ? parsed.data.counterpart_profile_id
        : existing.counterpart_profile_id,
    transfer_reason:
      parsed.data.transfer_reason !== undefined ? parsed.data.transfer_reason : existing.transfer_reason,
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

  // Editar um lançamento que já está numa empresa arquivada é permitido;
  // mover um lançamento para uma empresa arquivada, não.
  const relationError = await validateRelations(supabase, user.id, merged, {
    allowArchivedProfile: merged.profile_id === existing.profile_id,
    allowArchivedCounterpart: merged.counterpart_profile_id === existing.counterpart_profile_id,
  });
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
