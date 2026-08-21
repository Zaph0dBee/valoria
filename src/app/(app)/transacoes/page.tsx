import { createClient } from '@/lib/supabase/server';
import { TransactionsClient } from './transactions-client';

export default async function TransacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const [txRes, catRes, subRes] = await Promise.all([
    supabase
      .from('transactions')
      .select('id, occurred_on, amount, kind, description, notes, category_id, subcategory_id, categories(name, color)')
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('categories').select('id, name, kind, color').eq('archived', false).order('sort_order'),
    supabase.from('subcategories').select('id, category_id, name').eq('archived', false).order('sort_order'),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-1">movimentação</p>
        <h1 className="font-display text-4xl tracking-tight">Lançamentos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Os últimos 200 lançamentos. Filtro completo vem em breve.
        </p>
      </div>

      <TransactionsClient
        initialTransactions={txRes.data ?? []}
        categories={catRes.data ?? []}
        subcategories={subRes.data ?? []}
        openNewOnMount={params.new === '1'}
      />
    </div>
  );
}
