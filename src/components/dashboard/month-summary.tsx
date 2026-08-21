import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

type Summary = {
  total_receita: number | null;
  total_despesa: number | null;
  total_reserva: number | null;
  resultado_liquido: number | null;
  transactions_count: number;
};

export function MonthSummary({
  summary,
  prevResult,
}: {
  summary: Summary;
  prevResult: number | null;
}) {
  const result = Number(summary.resultado_liquido ?? 0);
  const receita = Number(summary.total_receita ?? 0);
  const despesa = Number(summary.total_despesa ?? 0);
  const reserva = Number(summary.total_reserva ?? 0);
  const positive = result >= 0;

  let variation: { pct: number; direction: 'up' | 'down' | 'flat' } | null = null;
  if (prevResult !== null && Number(prevResult) !== 0) {
    const prev = Number(prevResult);
    const pct = ((result - prev) / Math.abs(prev)) * 100;
    variation = {
      pct: Math.abs(pct),
      direction: pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat',
    };
  }

  return (
    <Card className="p-8 bg-paper">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
        <div>
          <p className="eyebrow mb-3">saldo do mês</p>
          <div className="flex items-baseline gap-3">
            <span
              className={cn(
                'font-display text-6xl md:text-7xl tracking-tight num',
                positive ? 'text-positive' : 'text-destructive',
              )}
            >
              {formatMoney(result)}
            </span>
          </div>
          {variation && (
            <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
              {variation.direction === 'up' && <ArrowUpRight className="h-4 w-4 text-positive" />}
              {variation.direction === 'down' && <ArrowDownRight className="h-4 w-4 text-destructive" />}
              {variation.direction === 'flat' && <Minus className="h-4 w-4" />}
              <span className="num">{variation.pct.toFixed(1)}%</span>
              <span>vs mês anterior</span>
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-6 md:gap-8 shrink-0">
          <SummaryItem label="entrou" value={receita} tone="positive" />
          <SummaryItem label="saiu" value={despesa} tone="destructive" />
          <SummaryItem label="reservou" value={reserva} tone="primary" />
        </div>
      </div>

      {receita > 0 && (
        <div className="mt-8">
          <p className="eyebrow mb-2">composição</p>
          <StackedBar receita={receita} despesa={despesa} reserva={reserva} />
        </div>
      )}
    </Card>
  );
}

function SummaryItem({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'positive' | 'destructive' | 'primary';
}) {
  const colors = {
    positive: 'text-positive',
    destructive: 'text-destructive',
    primary: 'text-primary',
  };
  return (
    <div>
      <p className="eyebrow mb-1">{label}</p>
      <p className={cn('font-display text-2xl num tracking-tight', colors[tone])}>
        {formatMoney(value)}
      </p>
    </div>
  );
}

function StackedBar({
  receita,
  despesa,
  reserva,
}: {
  receita: number;
  despesa: number;
  reserva: number;
}) {
  const total = Math.max(receita, despesa + reserva, 1);
  const despPct = (despesa / total) * 100;
  const resPct = (reserva / total) * 100;
  const restPct = Math.max(100 - despPct - resPct, 0);

  return (
    <div>
      <div className="h-2.5 w-full rounded-full overflow-hidden bg-muted flex">
        <div
          className="bg-destructive/85"
          style={{ width: `${despPct}%` }}
          title={`Despesas: ${despPct.toFixed(1)}%`}
        />
        <div
          className="bg-primary/85"
          style={{ width: `${resPct}%` }}
          title={`Reservas: ${resPct.toFixed(1)}%`}
        />
        <div
          className="bg-positive/60"
          style={{ width: `${restPct}%` }}
          title={`Sobrou: ${restPct.toFixed(1)}%`}
        />
      </div>
      <div className="flex flex-wrap gap-4 mt-3 text-xs text-muted-foreground">
        <LegendDot color="bg-destructive/85" label={`Despesas ${despPct.toFixed(0)}%`} />
        <LegendDot color="bg-primary/85" label={`Reservas ${resPct.toFixed(0)}%`} />
        <LegendDot color="bg-positive/60" label={`Sobrou ${restPct.toFixed(0)}%`} />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-2 w-2 rounded-full', color)} />
      {label}
    </span>
  );
}
