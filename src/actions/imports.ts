'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { TransactionKind } from '@/types/database';

export type ParsedRow = {
  occurred_on: string;
  amount: number;
  kind: TransactionKind;
  description: string;
  category_id?: string | null;
};

export async function importTransactions(input: {
  source: 'csv' | 'ofx';
  filename: string;
  rows: ParsedRow[];
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Não autenticado' };

  if (!input.rows.length) return { error: 'Nenhum lançamento encontrado no arquivo' };

  // Cria registro de import
  const { data: imp, error: impErr } = await supabase
    .from('imports')
    .insert({
      user_id: user.id,
      source: input.source,
      filename: input.filename,
      status: 'pending',
    })
    .select()
    .single();

  if (impErr || !imp) return { error: impErr?.message ?? 'Erro criando import' };

  // Insere transações
  const inserts = input.rows.map((r) => ({
    user_id: user.id,
    occurred_on: r.occurred_on,
    amount: r.amount,
    kind: r.kind,
    description: r.description,
    category_id: r.category_id ?? null,
    source: input.source,
    import_id: imp.id,
  }));

  const { error: txErr } = await supabase.from('transactions').insert(inserts);

  if (txErr) {
    await supabase
      .from('imports')
      .update({ status: 'failed', error_message: txErr.message })
      .eq('id', imp.id);
    return { error: txErr.message };
  }

  await supabase
    .from('imports')
    .update({
      status: 'processed',
      transactions_count: inserts.length,
      processed_at: new Date().toISOString(),
    })
    .eq('id', imp.id);

  revalidatePath('/dashboard');
  revalidatePath('/transacoes');
  revalidatePath('/importar');
  return { ok: true, count: inserts.length };
}
