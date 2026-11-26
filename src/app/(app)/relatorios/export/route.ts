import { createClient } from '@/lib/supabase/server';
import { profileLabel } from '@/lib/profile-selection';
import { toTransactionsCsv, type CsvTransaction } from '@/lib/csv-export';
import { isMonth, lastDayOfMonth, monthsBetween } from '@/lib/report-period';
import type { FinancialProfile, TransactionKind, TransferReason } from '@/types/database';

const PAGE = 1000;

type Row = {
  occurred_on: string;
  amount: number;
  kind: TransactionKind;
  description: string;
  profile_id: string;
  counterpart_profile_id: string | null;
  transfer_reason: TransferReason | null;
  categories: { name: string } | null;
  subcategories: { name: string } | null;
};

function badRequest(message: string) {
  return new Response(message, { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const from = params.get('from');
  const to = params.get('to');
  if (!isMonth(from) || !isMonth(to)) return badRequest('Período inválido: use from=AAAA-MM e to=AAAA-MM.');
  const months = monthsBetween(from, to);
  if (months < 1) return badRequest('Período inválido: o mês inicial vem depois do final.');
  if (months > 24) return badRequest('Período muito longo: exporte no máximo 24 meses por vez.');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Não autenticado', { status: 401 });

  const { data: profiles, error: profilesError } = await supabase.from('financial_profiles').select('*');
  if (profilesError) return new Response(profilesError.message, { status: 500 });
  const names = Object.fromEntries(((profiles ?? []) as FinancialProfile[]).map((p) => [p.id, profileLabel(p)]));

  const rows: Row[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('transactions')
      .select('occurred_on, amount, kind, description, profile_id, counterpart_profile_id, transfer_reason, categories(name), subcategories(name)')
      .eq('user_id', user.id)
      .gte('occurred_on', `${from}-01`)
      .lte('occurred_on', lastDayOfMonth(to))
      .order('occurred_on', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) return new Response(error.message, { status: 500 });
    rows.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < PAGE) break;
  }

  const csvRows: CsvTransaction[] = rows.map((r) => ({
    occurred_on: r.occurred_on,
    profile: names[r.profile_id] ?? 'outro perfil',
    kind: r.kind,
    category: r.categories?.name ?? null,
    subcategory: r.subcategories?.name ?? null,
    description: r.description,
    amount: Number(r.amount),
    counterpart: r.counterpart_profile_id ? (names[r.counterpart_profile_id] ?? 'outro perfil') : null,
    reason: r.transfer_reason,
  }));

  return new Response(toTransactionsCsv(csvRows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="valoria-${from}-a-${to}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
