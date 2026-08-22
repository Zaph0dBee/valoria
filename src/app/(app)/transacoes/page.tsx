import { createClient } from '@/lib/supabase/server';
import { TransactionsClient } from './transactions-client';
import type { TransactionKind } from '@/types/database';

const VALID_KINDS = new Set<TransactionKind>(['receita', 'despesa', 'reserva']);

export default async function TransacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; kind?: string; reserve?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const [txRes, catRes, subRes, reserveRes] = await Promise.all([
    supabase
      .from('transactions')
      .select('id, occurred_on, amount, kind, description, notes, category_id, subcategory_id, reserve_id, categories(name, color), reserves(name)')
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('categories').select('id, name, kind, color').eq('archived', false).order('sort_order'),
    supabase.from('subcategories').select('id, category_id, name').eq('archived', false).order('sort_order'),
    supabase.from('reserves').select('id, name').eq('archived', false).order('created_at'),
  ]);

  const initialKind = VALID_KINDS.has(params.kind as TransactionKind)
    ? (params.kind as TransactionKind)
    : undefined;

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-1">movimentação</p>
        <h1 className="font-display text-4xl tracking-tight">Lançamentos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Receitas, despesas e aportes em um só lugar. Aportes podem atualizar suas metas automaticamente.
        </p>
      </div>

      <TransactionsClient
        initialTransactions={txRes.data ?? []}
        categories={catRes.data ?? []}
        subcategories={subRes.data ?? []}
        reserves={reserveRes.data ?? []}
        openNewOnMount={params.new === '1'}
        initialKind={initialKind}
        initialReserveId={params.reserve}
      />
    </div>
  );
}
