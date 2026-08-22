'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { TransactionKind } from '@/types/database';

export type ParsedRow = {
  occurred_on: string;
  amount: number;
  kind: TransactionKind;
  description: string;
  category_id?: string | null;
};

const ParsedRowSchema = z.object({
  occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.coerce.number().finite().positive(),
  kind: z.enum(['receita', 'despesa', 'reserva']),
  description: z.string().trim().min(1).max(200),
  category_id: z.string().uuid().nullable().optional(),
});

const ImportSchema = z.object({
  source: z.enum(['csv', 'ofx']),
  filename: z.string().trim().min(1).max(255),
  rows: z.array(ParsedRowSchema).min(1).max(2000),
});

export async function importTransactions(input: {
  source: 'csv' | 'ofx';
  filename: string;
  rows: ParsedRow[];
}) {
  const parsed = ImportSchema.safeParse(input);
  if (!parsed.success) {
    const tooMany = input.rows?.length > 2000;
    return {
      error: tooMany
        ? 'O arquivo tem mais de 2.000 lançamentos. Divida-o em partes menores.'
        : 'Arquivo ou lançamentos inválidos',
    };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Não autenticado' };

  const categoryIds = [...new Set(parsed.data.rows.flatMap((row) => row.category_id ? [row.category_id] : []))];
  if (categoryIds.length) {
    const { data: ownedCategories, error: categoriesError } = await supabase
      .from('categories')
      .select('id')
      .eq('user_id', user.id)
      .in('id', categoryIds);

    if (categoriesError) return { error: categoriesError.message };
    if ((ownedCategories?.length ?? 0) !== categoryIds.length) {
      return { error: 'Uma ou mais categorias do arquivo não pertencem à sua conta' };
    }
  }

  const { data: imp, error: impErr } = await supabase
    .from('imports')
    .insert({
      user_id: user.id,
      source: parsed.data.source,
      filename: parsed.data.filename,
      status: 'pending',
    })
    .select('id')
    .single();

  if (impErr || !imp) return { error: impErr?.message ?? 'Erro criando importação' };

  const inserts = parsed.data.rows.map((row) => ({
    user_id: user.id,
    occurred_on: row.occurred_on,
    amount: row.amount,
    kind: row.kind,
    description: row.description,
    category_id: row.category_id ?? null,
    source: parsed.data.source,
    import_id: imp.id,
  }));

  const { error: txErr } = await supabase.from('transactions').insert(inserts);

  if (txErr) {
    await supabase
      .from('imports')
      .update({ status: 'failed', error_message: txErr.message })
      .eq('id', imp.id)
      .eq('user_id', user.id);
    return { error: txErr.message };
  }

  const { error: finishError } = await supabase
    .from('imports')
    .update({
      status: 'processed',
      transactions_count: inserts.length,
      processed_at: new Date().toISOString(),
    })
    .eq('id', imp.id)
    .eq('user_id', user.id);

  if (finishError) return { error: finishError.message };

  revalidatePath('/dashboard');
  revalidatePath('/transacoes');
  revalidatePath('/importar');
  return { ok: true, count: inserts.length };
}
