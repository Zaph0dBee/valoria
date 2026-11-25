import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { currentMonth, formatMonthName, monthRange } from '@/lib/format';
import { MonthSummary } from '@/components/dashboard/month-summary';
import { CategoryBreakdown } from '@/components/dashboard/category-breakdown';
import { RecentTransactions } from '@/components/dashboard/recent-transactions';
import { NCEDistribution } from '@/components/dashboard/nce-distribution';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

type FinancialSummary = {
  month: string;
  saldo_inicial: number;
  total_receita: number;
  total_despesa: number;
  resultado_operacional: number;
  total_aportes: number;
  disponivel_antes_aportes: number;
  saldo_final: number;
  transactions_count: number;
};

const EMPTY_SUMMARY: FinancialSummary = {
  month: '',
  saldo_inicial: 0,
  total_receita: 0,
  total_despesa: 0,
  resultado_operacional: 0,
  total_aportes: 0,
  disponivel_antes_aportes: 0,
  saldo_final: 0,
  transactions_count: 0,
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string }>;
}) {
  const params = await searchParams;
  const now = currentMonth();
  const requestedYear = Number(params.y);
  const requestedMonth = Number(params.m);
  const year = Number.isInteger(requestedYear) && requestedYear >= 2020 && requestedYear <= 2100
    ? requestedYear
    : now.year;
  const month = Number.isInteger(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 12
    ? requestedMonth
    : now.month;
  const { start, end } = monthRange(year, month);

  const prevM = month === 1 ? 12 : month - 1;
  const prevY = month === 1 ? year - 1 : year;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user!.id)
    .single();

  const firstName = (profile?.full_name ?? user?.email ?? '').split(' ')[0].split('@')[0];
  const capitalizedName = firstName.charAt(0).toUpperCase() + firstName.slice(1);

  const [summaryRes, breakdownRes, recentRes, prevRes, nceRes, openingRes] = await Promise.all([
    supabase.rpc('get_monthly_financial_summary', { target_year: year, target_month: month }),
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
    supabase.rpc('get_monthly_financial_summary', { target_year: prevY, target_month: prevM }),
    supabase
      .from('nce_distribution')
      .select('group_name, total')
      .eq('month', start),
    supabase
      .from('monthly_balances')
      .select('id')
      .eq('user_id', user!.id)
      .eq('year', year)
      .eq('month', month)
      .maybeSingle(),
  ]);

  const summary = (summaryRes.data?.[0] ?? { ...EMPTY_SUMMARY, month: start }) as FinancialSummary;
  const prevSummary = prevRes.data?.[0] as FinancialSummary | undefined;
  const totalIncome = Number(summary.total_receita ?? 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">painel · {formatMonthName(month, year).toLowerCase()}</p>
          <h1 className="font-display text-4xl md:text-5xl tracking-tight">
            Olá, {capitalizedName}.
          </h1>
          <p className="text-sm text-muted-foreground mt-2 voice">
            {summary.transactions_count === 0
              ? 'Ainda sem lançamentos neste mês. Defina o saldo inicial ou registre a primeira movimentação.'
              : `${summary.transactions_count} lançamentos no mês. Agora o saldo acompanha entradas, saídas e aportes.`}
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

      <MonthSummary
        summary={summary}
        prevOperationalResult={prevSummary?.resultado_operacional ?? null}
        year={year}
        month={month}
        openingIsManual={Boolean(openingRes.data)}
      />

      <NCEDistribution items={nceRes.data ?? []} totalIncome={totalIncome} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
