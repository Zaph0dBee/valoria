import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { currentMonth, formatMonthName, monthRange } from '@/lib/format';
import { MonthSummary } from '@/components/dashboard/month-summary';
import { CategoryBreakdown } from '@/components/dashboard/category-breakdown';
import { RecentTransactions } from '@/components/dashboard/recent-transactions';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string }>;
}) {
  const params = await searchParams;
  const now = currentMonth();
  const year = Number(params.y) || now.year;
  const month = Number(params.m) || now.month;
  const { start, end } = monthRange(year, month);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user!.id)
    .single();

  const firstName = (profile?.full_name ?? user?.email ?? '').split(' ')[0].split('@')[0];

  // Busca em paralelo
  const [summaryRes, breakdownRes, recentRes, prevRes] = await Promise.all([
    supabase
      .from('monthly_summary')
      .select('*')
      .eq('year', year)
      .eq('month_num', month)
      .maybeSingle(),
    supabase
      .from('category_breakdown')
      .select('*')
      .eq('month', start)
      .order('total', { ascending: false }),
    supabase
      .from('transactions')
      .select('id, occurred_on, amount, kind, description, category_id, categories(name, color)')
      .gte('occurred_on', start)
      .lte('occurred_on', end)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10),
    (async () => {
      const prevM = month === 1 ? 12 : month - 1;
      const prevY = month === 1 ? year - 1 : year;
      return supabase
        .from('monthly_summary')
        .select('resultado_liquido')
        .eq('year', prevY)
        .eq('month_num', prevM)
        .maybeSingle();
    })(),
  ]);

  const summary = summaryRes.data ?? {
    total_receita: 0,
    total_despesa: 0,
    total_reserva: 0,
    resultado_liquido: 0,
    transactions_count: 0,
  };

  const capitalizedName = firstName.charAt(0).toUpperCase() + firstName.slice(1);

  return (
    <div className="space-y-8">
      {/* Header do mês */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">painel · {formatMonthName(month, year).toLowerCase()}</p>
          <h1 className="font-display text-4xl md:text-5xl tracking-tight">
            Olá, {capitalizedName}.
          </h1>
          <p className="text-sm text-muted-foreground mt-2 voice">
            {summary.transactions_count === 0
              ? 'Ainda sem lançamentos neste mês. Vamos começar?'
              : `${summary.transactions_count} lançamentos no mês. A verdade tá na tela.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MonthNav year={year} month={month} />
          <Button asChild>
            <Link href="/transacoes?new=1">
              <Plus className="h-4 w-4" />
              Novo lançamento
            </Link>
          </Button>
        </div>
      </div>

      {/* Resumo do mês */}
      <MonthSummary summary={summary} prevResult={prevRes.data?.resultado_liquido ?? null} />

      <div className="grid gap-6 lg:grid-cols-[1fr,1fr]">
        <CategoryBreakdown items={breakdownRes.data ?? []} />
        <RecentTransactions items={recentRes.data ?? []} />
      </div>
    </div>
  );
}

function MonthNav({ year, month }: { year: number; month: number }) {
  const prevM = month === 1 ? 12 : month - 1;
  const prevY = month === 1 ? year - 1 : year;
  const nextM = month === 12 ? 1 : month + 1;
  const nextY = month === 12 ? year + 1 : year;

  return (
    <div className="flex items-center rounded-md border border-input overflow-hidden">
      <Button variant="ghost" size="sm" asChild className="rounded-none">
        <Link href={`/dashboard?y=${prevY}&m=${prevM}`}>‹</Link>
      </Button>
      <Button variant="ghost" size="sm" asChild className="rounded-none">
        <Link href="/dashboard">hoje</Link>
      </Button>
      <Button variant="ghost" size="sm" asChild className="rounded-none">
        <Link href={`/dashboard?y=${nextY}&m=${nextM}`}>›</Link>
      </Button>
    </div>
  );
}
