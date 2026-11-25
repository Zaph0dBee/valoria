'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { TransactionKind, TransferReason } from '@/types/database';
import { splitDuplicates, type DedupeRow } from '@/lib/import-dedupe';
import { matchExistingTransfers, resolveTransferRow } from '@/lib/transfers';

export type ParsedRow = {
  occurred_on: string;
  amount: number;
  kind: TransactionKind;
  description: string;
  category_id?: string | null;
  /** Sinal original no extrato: entrada ("in") ou saída ("out"). */
  direction?: 'in' | 'out';
  /** Para transferências: o OUTRO perfil (origem se entrada, destino se saída). */
  transfer_profile_id?: string | null;
  transfer_reason?: TransferReason | null;
};

const ParsedRowSchema = z.object({
  occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.coerce.number().finite().positive(),
  kind: z.enum(['receita', 'despesa', 'reserva', 'transferencia']),
  description: z.string().trim().min(1).max(200),
  category_id: z.string().uuid().nullable().optional(),
  direction: z.enum(['in', 'out']).optional(),
  transfer_profile_id: z.string().uuid().nullable().optional(),
  transfer_reason: z.enum(['pro_labore', 'lucros', 'aporte_capital', 'outro']).nullable().optional(),
});

const ImportSchema = z.object({
  profile_id: z.string().uuid(),
  source: z.enum(['csv', 'ofx']),
  filename: z.string().trim().min(1).max(255),
  rows: z.array(ParsedRowSchema).min(1).max(2000),
});

export async function importTransactions(input: {
  profile_id: string;
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

  const { data: profile, error: profileError } = await supabase
    .from('financial_profiles')
    .select('id, kind, archived')
    .eq('id', parsed.data.profile_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (profileError) return { error: profileError.message };
  if (!profile) return { error: 'Escolha de quem é este extrato' };
  if (profile.archived) return { error: 'Este perfil está arquivado' };
  if (profile.kind === 'pj' && parsed.data.rows.some((row) => row.kind === 'reserva')) {
    return { error: 'Empresas não fazem aporte em metas. Troque o tipo dessas linhas ou importe na PF.' };
  }

  const categoryIds = [...new Set(parsed.data.rows.flatMap((row) => row.category_id ? [row.category_id] : []))];
  if (categoryIds.length) {
    const { data: ownedCategories, error: categoriesError } = await supabase
      .from('categories')
      .select('id, kind')
      .eq('user_id', user.id)
      .eq('profile_id', parsed.data.profile_id)
      .in('id', categoryIds);

    if (categoriesError) return { error: categoriesError.message };
    if ((ownedCategories?.length ?? 0) !== categoryIds.length) {
      return { error: 'Uma ou mais categorias não pertencem ao perfil escolhido' };
    }
    const kindById = new Map(ownedCategories!.map((c) => [c.id, c.kind]));
    const mismatch = parsed.data.rows.find(
      (row) => row.category_id && kindById.get(row.category_id) !== row.kind,
    );
    if (mismatch) {
      return {
        error: `A categoria de "${mismatch.description}" não corresponde ao tipo do lançamento`,
      };
    }
  }

  // Transferências: resolve origem/destino, valida e separa as já registradas
  // (a mesma transferência pode vir no extrato da empresa e no da PF).
  const transferRows = parsed.data.rows.filter((row) => row.kind === 'transferencia');
  const plainRows = parsed.data.rows.filter((row) => row.kind !== 'transferencia');
  type ResolvedTransfer = {
    occurred_on: string;
    amount: number;
    description: string;
    profile_id: string;
    counterpart_profile_id: string;
    transfer_reason: TransferReason;
  };
  const resolvedTransfers: ResolvedTransfer[] = [];
  if (transferRows.length) {
    const { data: ownProfiles, error: ownError } = await supabase
      .from('financial_profiles')
      .select('id, kind, archived')
      .eq('user_id', user.id);
    if (ownError) return { error: ownError.message };
    const byId = new Map((ownProfiles ?? []).map((p) => [p.id, p]));
    for (const row of transferRows) {
      if (!row.transfer_profile_id || !row.transfer_reason || !row.direction) {
        return { error: `Escolha o outro perfil e o motivo da transferência "${row.description}"` };
      }
      if (row.category_id) return { error: 'Transferência não tem categoria' };
      const ends = resolveTransferRow(
        { direction: row.direction, transfer_profile_id: row.transfer_profile_id },
        parsed.data.profile_id,
      );
      const origin = byId.get(ends.profile_id);
      const target = byId.get(ends.counterpart_profile_id);
      if (!origin || !target || origin.id === target.id) {
        return { error: `Perfis inválidos na transferência "${row.description}"` };
      }
      if (origin.archived || target.archived) return { error: 'Um dos perfis da transferência está arquivado' };
      if ((row.transfer_reason === 'pro_labore' || row.transfer_reason === 'lucros') && !(origin.kind === 'pj' && target.kind === 'pf')) {
        return { error: `"${row.description}": pró-labore e lucros vão da empresa para a PF` };
      }
      if (row.transfer_reason === 'aporte_capital' && !(origin.kind === 'pf' && target.kind === 'pj')) {
        return { error: `"${row.description}": aporte de capital vai da PF para a empresa` };
      }
      resolvedTransfers.push({
        occurred_on: row.occurred_on,
        amount: row.amount,
        description: row.description,
        profile_id: ends.profile_id,
        counterpart_profile_id: ends.counterpart_profile_id,
        transfer_reason: row.transfer_reason,
      });
    }
  }

  let freshTransfers: ResolvedTransfer[] = [];
  let alreadyTransfers: ResolvedTransfer[] = [];
  if (resolvedTransfers.length) {
    const tDates = resolvedTransfers.map((t) => t.occurred_on).sort();
    const shift = (iso: string, days: number) =>
      new Date(Date.parse(`${iso}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
    const involved = [...new Set(resolvedTransfers.flatMap((t) => [t.profile_id, t.counterpart_profile_id]))];
    const { data: existingTransfers, error: existingError } = await supabase
      .from('transactions')
      .select('occurred_on, amount, description, profile_id, counterpart_profile_id, transfer_reason')
      .eq('user_id', user.id)
      .eq('kind', 'transferencia')
      .in('profile_id', involved)
      .gte('occurred_on', shift(tDates[0], -3))
      .lte('occurred_on', shift(tDates[tDates.length - 1], 3));
    if (existingError) return { error: existingError.message };
    const split = matchExistingTransfers(resolvedTransfers, (existingTransfers ?? []) as ResolvedTransfer[]);
    freshTransfers = split.fresh;
    alreadyTransfers = split.already;
  }

  // Evita duplicar lançamentos ao importar o mesmo extrato (ou extratos que se sobrepõem).
  const dates = (plainRows.length ? plainRows : parsed.data.rows).map((row) => row.occurred_on).sort();
  const existing: DedupeRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('transactions')
      .select('occurred_on, amount, kind, description')
      .eq('user_id', user.id)
      .eq('profile_id', parsed.data.profile_id)
      .gte('occurred_on', dates[0])
      .lte('occurred_on', dates[dates.length - 1])
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) return { error: error.message };
    existing.push(...((data ?? []) as DedupeRow[]));
    if (!data || data.length < PAGE) break;
  }

  const { fresh, duplicates } = splitDuplicates(plainRows, existing);
  const skipped = duplicates.length + alreadyTransfers.length;
  if (fresh.length === 0 && freshTransfers.length === 0) {
    return { ok: true, count: 0, skipped };
  }

  const { data: imp, error: impErr } = await supabase
    .from('imports')
    .insert({
      user_id: user.id,
      profile_id: parsed.data.profile_id,
      source: parsed.data.source,
      filename: parsed.data.filename,
      status: 'pending',
    })
    .select('id')
    .single();

  if (impErr || !imp) return { error: impErr?.message ?? 'Erro criando importação' };

  const inserts = [
    ...fresh.map((row) => ({
      user_id: user.id,
      profile_id: parsed.data.profile_id,
      occurred_on: row.occurred_on,
      amount: row.amount,
      kind: row.kind,
      description: row.description,
      category_id: row.category_id ?? null,
      counterpart_profile_id: null as string | null,
      transfer_reason: null as TransferReason | null,
      source: parsed.data.source,
      import_id: imp.id,
    })),
    ...freshTransfers.map((t) => ({
      user_id: user.id,
      profile_id: t.profile_id,
      occurred_on: t.occurred_on,
      amount: t.amount,
      kind: 'transferencia' as const,
      description: t.description,
      category_id: null,
      counterpart_profile_id: t.counterpart_profile_id,
      transfer_reason: t.transfer_reason,
      source: parsed.data.source,
      import_id: imp.id,
    })),
  ];

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
  return { ok: true, count: inserts.length, skipped };
}
