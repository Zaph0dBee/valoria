import Link from 'next/link';
import { Download } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getProfileContext } from '@/lib/profile-context';
import { profileLabel } from '@/lib/profile-selection';
import { currentMonth, formatMoney, formatMonthName } from '@/lib/format';
import { isMonth, monthsBetween, shiftMonth } from '@/lib/report-period';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { ResultsChart, type ChartPoint } from './results-chart';
import { comparisonLines } from '@/lib/report-lines';

type SummaryRow = {
  month: string;
  profile_id: string | null;
  total_receita: number;
  total_despesa: number;
  resultado_operacional: number;
  total_aportes: number;
  saldo_final: number;
  transf_recebidas: number;
  transf_enviadas: number;
  entradas_transferidas: number;
  pro_labore_pago: number;
  lucros_distribuidos: number;
};

const CONSOLIDATED = 'consolidado';

function monthShort(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${formatMonthName(m).slice(0, 3).toLowerCase()}/${String(y).slice(2)}`;
}

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const now = currentMonth();
  const thisMonth = `${now.year}-${String(now.month).padStart(2, '0')}`;
  const selected = isMonth(params.m) ? params.m : thisMonth;
  const start = shiftMonth(selected, -11);

  const exportFrom = isMonth(params.from) ? params.from : shiftMonth(thisMonth, -11);
  const exportTo = isMonth(params.to) ? params.to : thisMonth;
  const exportMonths = monthsBetween(exportFrom, exportTo);
  const exportError =
    exportMonths < 1 ? 'O mês inicial vem depois do final.' : exportMonths > 24 ? 'Exporte no máximo 24 meses por vez.' : null;

  const supabase = await createClient();
  const profileCtx = await getProfileContext();
  const { data, error } = await supabase.rpc('get_monthly_summaries', { start_month: `${start}-01`, months: 12 });
  const rows = (data ?? []) as SummaryRow[];

  // Colunas: perfis ativos (PF primeiro) e arquivados que tiveram movimento no período.
  const withData = new Set(
    rows.filter((r) => r.profile_id && (Number(r.total_receita) || Number(r.total_despesa) || Number(r.transf_enviadas) || Number(r.transf_recebidas))).map((r) => r.profile_id!),
  );
  const columns = profileCtx.profiles.filter((p) => !p.archived || withData.has(p.id));
  const companies = columns.filter((p) => p.kind === 'pj');
  const key = (r: SummaryRow) => `${r.month.slice(0, 7)}|${r.profile_id ?? CONSOLIDATED}`;
  const byKey = new Map(rows.map((r) => [key(r), r]));
  const get = (ym: string, id: string) => byKey.get(`${ym}|${id}`);

  const lineLabels = comparisonLines(undefined);

  const months = Array.from({ length: 12 }, (_, i) => shiftMonth(start, i));
  const series = columns.map((p) => ({ id: p.id, label: profileLabel(p) }));
  const chartData: ChartPoint[] = months.map((ym) => {
    const point: ChartPoint = { month: ym, label: monthShort(ym) };
    for (const s of series) point[s.id] = Number(get(ym, s.id)?.resultado_operacional ?? 0);
    return point;
  });

  const withdrawals = companies.map((c) => {
    const proLabore = months.reduce((sum, ym) => sum + Number(get(ym, c.id)?.pro_labore_pago ?? 0), 0);
    const lucros = months.reduce((sum, ym) => sum + Number(get(ym, c.id)?.lucros_distribuidos ?? 0), 0);
    return { id: c.id, name: profileLabel(c), proLabore, lucros };
  });

  const [sy, sm] = selected.split('-').map(Number);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow mb-2">relatórios · {formatMonthName(sm, sy).toLowerCase()}</p>
          <h1 className="font-display text-4xl md:text-5xl tracking-tight">Relatórios</h1>
          <p className="text-sm text-muted-foreground mt-2 voice">
            Você e suas empresas lado a lado. No consolidado, transferências entre perfis não contam.
          </p>
        </div>
        <div className="flex items-center rounded-md border border-input overflow-hidden">
          <Button variant="ghost" size="sm" asChild className="rounded-none">
            <Link href={`/relatorios?m=${shiftMonth(selected, -1)}`} aria-label="Mês anterior">‹</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild className="rounded-none">
            <Link href="/relatorios">hoje</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild className="rounded-none">
            <Link href={`/relatorios?m=${shiftMonth(selected, 1)}`} aria-label="Próximo mês">›</Link>
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">Não foi possível carregar os relatórios: {error.message}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Comparativo do mês</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="report-comparison">
            <thead>
              <tr className="border-b">
                <td className="py-2 pr-4" />
                {columns.map((p) => (
                  <th key={p.id} scope="col" className="py-2 px-3 text-right font-medium whitespace-nowrap">
                    {profileLabel(p)}
                  </th>
                ))}
                <th scope="col" className="py-2 pl-3 text-right font-medium">Consolidado</th>
              </tr>
            </thead>
            <tbody>
              {lineLabels.map((line, index) => (
                <tr key={line.label} className={cn('border-b last:border-0', line.strong && 'font-medium')}>
                  <th scope="row" className="py-2 pr-4 text-left font-normal text-muted-foreground">{line.label}</th>
                  {[...columns.map((p) => p.id), CONSOLIDATED].map((id) => {
                    const value = comparisonLines(get(selected, id))[index].value;
                    return (
                      <td key={id} className={cn('py-2 px-3 text-right num whitespace-nowrap', value < 0 && 'text-destructive')}>
                        {formatMoney(value)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg" role="heading" aria-level={2}>Evolução dos últimos 12 meses</CardTitle>
          <p className="text-xs text-muted-foreground">Resultado de cada perfil, mês a mês, até {formatMonthName(sm, sy).toLowerCase()}.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <ResultsChart series={series} data={chartData} />
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Ver os números</summary>
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th scope="col" className="py-1 pr-3 text-left font-medium">Mês</th>
                    {series.map((s) => (
                      <th key={s.id} scope="col" className="py-1 px-2 text-right font-medium whitespace-nowrap">{s.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {chartData.map((pt) => (
                    <tr key={pt.month} className="border-b last:border-0">
                      <th scope="row" className="py-1 pr-3 text-left font-normal">{pt.label}</th>
                      {series.map((s) => (
                        <td key={s.id} className="py-1 px-2 text-right num whitespace-nowrap">{formatMoney(Number(pt[s.id]))}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg" role="heading" aria-level={2}>Retiradas da empresa para você</CardTitle>
            <p className="text-xs text-muted-foreground">Nos últimos 12 meses, até {formatMonthName(sm, sy).toLowerCase()}.</p>
          </CardHeader>
          <CardContent>
            {withdrawals.length === 0 ? (
              <p className="text-sm text-muted-foreground">Cadastre uma empresa em Minhas empresas para acompanhar pró-labore e lucros.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th scope="col" className="py-2 pr-3 text-left font-medium">Empresa</th>
                    <th scope="col" className="py-2 px-3 text-right font-medium">Pró-labore</th>
                    <th scope="col" className="py-2 px-3 text-right font-medium">Lucros</th>
                    <th scope="col" className="py-2 pl-3 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {withdrawals.map((w) => (
                    <tr key={w.id} className="border-b last:border-0">
                      <th scope="row" className="py-2 pr-3 text-left font-normal">{w.name}</th>
                      <td className="py-2 px-3 text-right num">{formatMoney(w.proLabore)}</td>
                      <td className="py-2 px-3 text-right num">{formatMoney(w.lucros)}</td>
                      <td className="py-2 pl-3 text-right num font-medium">{formatMoney(w.proLabore + w.lucros)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg" role="heading" aria-level={2}>Exportar lançamentos</CardTitle>
            <p className="text-xs text-muted-foreground">Planilha CSV com a coluna de perfil, pronta para o Excel ou o contador.</p>
          </CardHeader>
          <CardContent>
            <form method="get" action="/relatorios" className="grid grid-cols-2 gap-3">
              {isMonth(params.m) && <input type="hidden" name="m" value={params.m} />}
              <div className="space-y-1">
                <Label htmlFor="export-from">De</Label>
                <Input id="export-from" name="from" type="month" defaultValue={exportFrom} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="export-to">Até</Label>
                <Input id="export-to" name="to" type="month" defaultValue={exportTo} />
              </div>
              <Button type="submit" variant="outline" className="col-span-2">Usar este período</Button>
            </form>
            {exportError ? (
              <p className="mt-3 text-sm text-destructive">{exportError}</p>
            ) : (
              <Button asChild className="mt-3 w-full">
                <a href={`/relatorios/export?from=${exportFrom}&to=${exportTo}`} download>
                  <Download className="h-4 w-4" />
                  Exportar CSV
                </a>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
