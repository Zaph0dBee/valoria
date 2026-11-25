'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const IdSchema = z.string().uuid();
const GroupSchema = z.enum(['necessidades', 'construcao', 'estilo', 'livre']);
const RecurrenceSchema = z.enum(['none', 'weekly', 'biweekly', 'monthly', 'yearly']);
const ExpenseNatureSchema = z.enum(['fixa', 'variavel']);

const PlanningFieldsSchema = z.object({
  planned_amount: z.number().finite().min(0).nullable().optional(),
  recurrence: RecurrenceSchema.optional(),
  day_of_month: z.number().int().min(1).max(31).nullable().optional(),
  expense_nature: ExpenseNatureSchema.nullable().optional(),
  include_in_budget: z.boolean().optional(),
  planning_notes: z.string().trim().max(500).nullable().optional(),
  default_reserve_id: IdSchema.nullable().optional(),
});

const CategorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(['receita', 'despesa', 'reserva']),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#B99154'),
});

const CategoryUpdateSchema = PlanningFieldsSchema.extend({
  name: z.string().trim().min(1).max(60).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  group: GroupSchema.nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, 'Nenhum campo para atualizar');

const SubcategorySchema = z.object({
  category_id: IdSchema,
  name: z.string().trim().min(1).max(80),
});

const SubcategoryUpdateSchema = PlanningFieldsSchema.extend({
  name: z.string().trim().min(1).max(80).optional(),
  group_override: GroupSchema.nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, 'Nenhum campo para atualizar');

function revalidateCategoryViews() {
  revalidatePath('/categorias');
  revalidatePath('/dashboard');
  revalidatePath('/transacoes');
}

async function getAuthenticatedClient() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

async function validateReserve(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  reserveId: string,
) {
  const { data, error } = await supabase
    .from('reserves')
    .select('id')
    .eq('id', reserveId)
    .eq('user_id', userId)
    .eq('archived', false)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: 'Meta vinculada não encontrada' };
  return { ok: true };
}

export async function createCategory(input: z.infer<typeof CategorySchema>) {
  const parsed = CategorySchema.safeParse(input);
  if (!parsed.success) return { error: 'Dados inválidos' };

  const { supabase, user } = await getAuthenticatedClient();
  if (!user) return { error: 'Não autenticado' };

  const { error, data } = await supabase
    .from('categories')
    .insert({
      ...parsed.data,
      user_id: user.id,
      group: parsed.data.kind === 'reserva' ? 'construcao' : null,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  revalidateCategoryViews();
  return { ok: true, category: data };
}

export async function updateCategory(
  id: string,
  input: z.infer<typeof CategoryUpdateSchema>,
) {
  const parsedId = IdSchema.safeParse(id);
  const parsed = CategoryUpdateSchema.safeParse(input);
  if (!parsedId.success || !parsed.success) return { error: 'Dados inválidos' };

  const { supabase, user } = await getAuthenticatedClient();
  if (!user) return { error: 'Não autenticado' };

  const { data: category, error: categoryError } = await supabase
    .from('categories')
    .select('id, kind')
    .eq('id', parsedId.data)
    .eq('user_id', user.id)
    .maybeSingle();

  if (categoryError) return { error: categoryError.message };
  if (!category) return { error: 'Categoria não encontrada' };

  const update = { ...parsed.data };

  if (category.kind === 'receita') {
    update.group = null;
    update.expense_nature = null;
    update.default_reserve_id = null;
  } else if (category.kind === 'despesa') {
    update.default_reserve_id = null;
  } else {
    update.group = update.group ?? 'construcao';
    update.expense_nature = null;
  }

  if (update.default_reserve_id) {
    const reserveValidation = await validateReserve(supabase, user.id, update.default_reserve_id);
    if (reserveValidation.error) return reserveValidation;
  }

  const { error } = await supabase
    .from('categories')
    .update(update)
    .eq('id', parsedId.data)
    .eq('user_id', user.id);

  if (error) return { error: error.message };
  revalidateCategoryViews();
  return { ok: true };
}

export async function archiveCategory(id: string) {
  const parsedId = IdSchema.safeParse(id);
  if (!parsedId.success) return { error: 'Categoria inválida' };

  const { supabase, user } = await getAuthenticatedClient();
  if (!user) return { error: 'Não autenticado' };

  const { error } = await supabase
    .from('categories')
    .update({ archived: true })
    .eq('id', parsedId.data)
    .eq('user_id', user.id);

  if (error) return { error: error.message };
  revalidateCategoryViews();
  return { ok: true };
}

export async function createSubcategory(input: z.infer<typeof SubcategorySchema>) {
  const parsed = SubcategorySchema.safeParse(input);
  if (!parsed.success) return { error: 'Dados inválidos' };

  const { supabase, user } = await getAuthenticatedClient();
  if (!user) return { error: 'Não autenticado' };

  const { data: category, error: categoryError } = await supabase
    .from('categories')
    .select('id')
    .eq('id', parsed.data.category_id)
    .eq('user_id', user.id)
    .eq('archived', false)
    .maybeSingle();

  if (categoryError) return { error: categoryError.message };
  if (!category) return { error: 'Categoria não encontrada' };

  const { error } = await supabase.from('subcategories').insert({
    category_id: parsed.data.category_id,
    name: parsed.data.name,
    user_id: user.id,
  });

  if (error) return { error: error.message };
  revalidateCategoryViews();
  return { ok: true };
}

export async function updateSubcategory(
  id: string,
  input: z.infer<typeof SubcategoryUpdateSchema>,
) {
  const parsedId = IdSchema.safeParse(id);
  const parsed = SubcategoryUpdateSchema.safeParse(input);
  if (!parsedId.success || !parsed.success) return { error: 'Dados inválidos' };

  const { supabase, user } = await getAuthenticatedClient();
  if (!user) return { error: 'Não autenticado' };

  const { data: subcategory, error: subcategoryError } = await supabase
    .from('subcategories')
    .select('id, category_id')
    .eq('id', parsedId.data)
    .eq('user_id', user.id)
    .maybeSingle();

  if (subcategoryError) return { error: subcategoryError.message };
  if (!subcategory) return { error: 'Subcategoria não encontrada' };

  const { data: parentCategory, error: parentError } = await supabase
    .from('categories')
    .select('kind')
    .eq('id', subcategory.category_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (parentError) return { error: parentError.message };
  if (!parentCategory) return { error: 'Categoria da subcategoria não encontrada' };

  const update = { ...parsed.data };

  if (parentCategory.kind === 'receita') {
    update.group_override = null;
    update.expense_nature = null;
    update.default_reserve_id = null;
  } else if (parentCategory.kind === 'despesa') {
    update.default_reserve_id = null;
  } else {
    update.expense_nature = null;
  }

  if (update.default_reserve_id) {
    const reserveValidation = await validateReserve(supabase, user.id, update.default_reserve_id);
    if (reserveValidation.error) return reserveValidation;
  }

  const { error } = await supabase
    .from('subcategories')
    .update(update)
    .eq('id', parsedId.data)
    .eq('user_id', user.id);

  if (error) return { error: error.message };
  revalidateCategoryViews();
  return { ok: true };
}

export async function archiveSubcategory(id: string) {
  const parsedId = IdSchema.safeParse(id);
  if (!parsedId.success) return { error: 'Subcategoria inválida' };

  const { supabase, user } = await getAuthenticatedClient();
  if (!user) return { error: 'Não autenticado' };

  const { error } = await supabase
    .from('subcategories')
    .update({ archived: true })
    .eq('id', parsedId.data)
    .eq('user_id', user.id);

  if (error) return { error: error.message };
  revalidateCategoryViews();
  return { ok: true };
}
