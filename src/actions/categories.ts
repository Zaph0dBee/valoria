'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const CategorySchema = z.object({
  name: z.string().min(1).max(60),
  kind: z.enum(['receita', 'despesa', 'reserva']),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#1e3a5f'),
});

export async function createCategory(input: z.infer<typeof CategorySchema>) {
  const parsed = CategorySchema.safeParse(input);
  if (!parsed.success) return { error: 'Dados inválidos' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Não autenticado' };

  const { error, data } = await supabase
    .from('categories')
    .insert({ ...parsed.data, user_id: user.id })
    .select()
    .single();

  if (error) return { error: error.message };
  revalidatePath('/categorias');
  revalidatePath('/dashboard');
  return { ok: true, category: data };
}

export async function updateCategory(id: string, input: Partial<z.infer<typeof CategorySchema>>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Não autenticado' };

  const { error } = await supabase
    .from('categories')
    .update(input)
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return { error: error.message };
  revalidatePath('/categorias');
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function archiveCategory(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Não autenticado' };

  const { error } = await supabase
    .from('categories')
    .update({ archived: true })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return { error: error.message };
  revalidatePath('/categorias');
  return { ok: true };
}

export async function createSubcategory(input: {
  category_id: string;
  name: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Não autenticado' };

  const { error } = await supabase.from('subcategories').insert({
    category_id: input.category_id,
    name: input.name,
    user_id: user.id,
  });

  if (error) return { error: error.message };
  revalidatePath('/categorias');
  return { ok: true };
}
