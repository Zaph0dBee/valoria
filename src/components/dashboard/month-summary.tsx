import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { formatMoney, formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';
import { OpeningBalanceEditor } from './opening-balance-editor';

type Summary = {
  saldo_inicial: number;
  total_receita: number;
  total_despesa: number;
  resultado_operacional: number;
  total_aportes: number;
  disponivel_antes_aportes: number;
  saldo_final: number;
  transactions_count: number;
  transf_recebidas?: number;
  transf_enviadas?: number;
  entradas_transferidas?: number;
};

export function MonthSummary({
  summary,
  prevOperationalResult,
  year,
  month,
  openingIsManual,
  profileId,
}: {
  summary: Summary;
  prevOperationalResult: number | null;
  year: number;
  month: number;
  openingIsManual: boolean;
  /** null no Consolidado: o saldo inicial é definido por perfil. */
  profileId: string | null;
}) {
  const opening = Number(summary.saldo_inicial ?? 0);
  // Na PF, pró-labore e lucros recebidos da empresa também são entradas.
  const receita = Number(summary.total_receita ?? 0) + Number(summary.entradas_transferidas ?? 0);
  const transfIn = Number(summary.transf_recebidas ?? 0);
  const transfOut = Number(summary.transf_enviadas ?? 0);
  const despesa = Number(summary.total_despesa ?? 0);
  const operational = Number(summary.resultado_operacional ?? 0);
  const aportes = Number(summary.total_aportes ?? 0);
  const finalBalance = Number(summary.saldo_final ?? 0);
  const positive = finalBalance >= 0;

  let variation: { pct: number; direction: 'up' | 'down' | 'flat' } | null = null;
  if (prevOperationalResult !== null && Number(prevOperationalResult) !== 0) {
    const prev = Number(prevOperationalResult);
    const pct = ((operational - prev) / Math.abs(prev)) * 100;
    variation = {
      pct: Math.abs(pct),
      direction: pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat',
    };
  }

  return (
    <Card className="p-8 bg-paper">
      <div className="space-y-7">
        <div className="flex flex-col gap-6">
          <div>
            <p className="eyebrow mb-3">saldo disponível</p>
            <span
              className={cn(
                'font-display text-6xl md:text-7xl tracking-tight num',
                positive ? 'text-positive' : 'text-destructive',
              )}
            >
              {formatMoney(finalBalance)}
            </span>
            <p className="mt-2 text-xs text-muted-foreground">
              Saldo inicial + receitas − despesas − aportes.
            </p>
            {variation && (
              <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
                {variation.direction === 'up' && <ArrowUpRight className="h-4 w-4 text-positive" />}
                {variation.direction === 'down' && <ArrowDownRight className="h-4 w-4 text-destructive" />}
                {variation.direction === 'flat' && <Minus className="h-4 w-4" />}
                <span className="num">{formatPercent(variation.pct, 1)}</span>
                <span>no resultado operacional vs mês anterior</span>
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-7 gap-y-5 min-w-0">
            <div>
              <div className="flex items-center gap-1">
                <p className="eyebrow">saldo inicial</p>
                {profileId && (
                  <OpeningBalanceEditor
                    profileId={profileId}
                    year={year}
                    month={month}
                    currentValue={opening}
                    isManual={openingIsManual}
                  />
                )}
              </div>
              <p className="font-display text-2xl num tracking-tight">{formatMoney(opening)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{profileId === null ? 'soma dos perfis' : openingIsManual ? 'definido por você' : 'carregado automaticamente'}</p>
            </div>
            <SummaryItem label="entradas" value={receita} tone="positive" />
            <SummaryItem label="saídas" value={despesa} tone="destructive" />
            <SummaryItem label="resultado" value={operational} tone={operational >= 0 ? 'positive' : 'destructive'} />
            <SummaryItem label="aportes" value={aportes} tone="primary" />
            {(transfIn > 0 || transfOut > 0) && (
              <div data-testid="summary-transferencias">
                <p className="eyebrow mb-1">transferências</p>
                <p className="text-sm num text-muted-foreground">
                  {transfIn > 0 && <span className="block text-positive">+{formatMoney(transfIn)} recebidas</span>}
                  {transfOut > 0 && <span className="block text-destructive">−{formatMoney(transfOut)} enviadas</span>}
                </p>
              </div>
            )}
          </div>
        </div>

        {receita > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="eyebrow">uso das entradas</p>
              <p className="text-xs text-muted-foreground num">
                antes dos aportes: {formatMoney(Number(summary.disponivel_antes_aportes ?? 0))}
              </p>
            </div>
            <StackedBar receita={receita} despesa={despesa} aportes={aportes} />
          </div>
        )}
      </div>
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
    <div data-testid={`summary-${label}`}>
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
  aportes,
}: {
  receita: number;
  despesa: number;
  aportes: number;
}) {
  const total = Math.max(receita, despesa + aportes, 1);
  const despPct = (despesa / total) * 100;
  const aportePct = (aportes / total) * 100;
  const restPct = Math.max(100 - despPct - aportePct, 0);

  return (
    <div>
      <div className="h-2.5 w-full rounded-full overflow-hidden bg-muted flex">
        <div className="bg-destructive/85" style={{ width: `${despPct}%` }} title={`Despesas: ${formatPercent(despPct, 1)}`} />
        <div className="bg-primary/85" style={{ width: `${aportePct}%` }} title={`Aportes: ${formatPercent(aportePct, 1)}`} />
        <div className="bg-positive/60" style={{ width: `${restPct}%` }} title={`Livre: ${formatPercent(restPct, 1)}`} />
      </div>
      <div className="flex flex-wrap gap-4 mt-3 text-xs text-muted-foreground">
        <LegendDot color="bg-destructive/85" label={`Despesas ${formatPercent(despPct, 0)}`} />
        <LegendDot color="bg-primary/85" label={`Aportes ${formatPercent(aportePct, 0)}`} />
        <LegendDot color="bg-positive/60" label={`Livre ${formatPercent(restPct, 0)}`} />
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
