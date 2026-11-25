'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isValidCnpj, normalizeDocument } from '@/lib/cnpj';
import { CONSOLIDATED, PROFILE_COOKIE } from '@/lib/profile-selection';

const IdSchema = z.string().uuid();
const ColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const CompanySchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome da empresa').max(80),
  document: z.string().optional().nullable(),
  color: ColorSchema.optional(),
});

function parseDocument(raw: string | null | undefined): { value: string | null } | { error: string } {
  const digits = normalizeDocument(raw ?? '');
  if (!digits) return { value: null };
  if (!isValidCnpj(digits)) return { error: 'CNPJ inválido' };
  return { value: digits };
}

function revalidateAll() {
  revalidatePath('/', 'layout');
}

/** Grava qual perfil a pessoa está vendo (id de perfil ou "all"). */
export async function setActiveProfile(value: string) {
  if (value !== CONSOLIDATED && !IdSchema.safeParse(value).success) {
    return { error: 'Perfil inválido' };
  }
  const cookieStore = await cookies();
  cookieStore.set(PROFILE_COOKIE, value, {
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidateAll();
  return { ok: true };
}

export async function createCompany(input: z.infer<typeof CompanySchema> & { useTemplate: boolean }) {
  const parsed = CompanySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' };
  const doc = parseDocument(parsed.data.document);
  if ('error' in doc) return { error: doc.error };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Não autenticado' };

  const { data, error } = await supabase
    .from('financial_profiles')
    .insert({
      user_id: user.id,
      kind: 'pj',
      name: parsed.data.name,
      document: doc.value,
      ...(parsed.data.color ? { color: parsed.data.color } : {}),
    })
    .select('id')
    .single();
  if (error || !data) return { error: error?.message ?? 'Erro ao criar empresa' };

  if (input.useTemplate) {
    const { error: templateError } = await supabase.rpc('apply_pj_template', { target_profile: data.id });
    if (templateError) return { error: templateError.message };
  }

  revalidateAll();
  return { ok: true, id: data.id };
}

export async function updateCompany(id: string, input: Partial<z.infer<typeof CompanySchema>>) {
  if (!IdSchema.safeParse(id).success) return { error: 'Empresa inválida' };
  const parsed = CompanySchema.partial().safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' };

  const patch: { name?: string; document?: string | null; color?: string } = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.color !== undefined) patch.color = parsed.data.color;
  if (parsed.data.document !== undefined) {
    const doc = parseDocument(parsed.data.document);
    if ('error' in doc) return { error: doc.error };
    patch.document = doc.value;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('financial_profiles')
    .update(patch)
    .eq('id', id)
    .eq('kind', 'pj')
    .select('id')
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: 'Empresa não encontrada' };

  revalidateAll();
  return { ok: true };
}

export async function setCompanyArchived(id: string, archived: boolean) {
  if (!IdSchema.safeParse(id).success) return { error: 'Empresa inválida' };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('financial_profiles')
    .update({ archived })
    .eq('id', id)
    .eq('kind', 'pj')
    .select('id')
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: 'Empresa não encontrada' };

  revalidateAll();
  return { ok: true };
}

export async function deleteCompany(id: string) {
  if (!IdSchema.safeParse(id).success) return { error: 'Empresa inválida' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('delete_company', { target_profile: id });
  if (error) return { error: error.message };

  revalidateAll();
  return { ok: true };
}
