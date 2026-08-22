import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMoney } from '@/lib/format';
import {
  GROUP_REFERENCES,
  GROUP_LABELS,
  GROUP_DESCRIPTIONS,
  calcSemaphore,
  SEMAPHORE_STYLES,
  referenceMessage,
  type SemaphoreLevel,
} from '@/lib/valoria-references';
import type { CategoryGroup } from '@/types/database';
import { cn } from '@/lib/utils';

type NCEItem = {
  group_name: CategoryGroup | null;
  total: number;
};

export function NCEDistribution({
  items,
  totalIncome,
}: {
  items: NCEItem[];
  totalIncome: number;
}) {
  // Agrega totais por grupo
  const totals: Record<CategoryGroup | 'null', number> = {
    necessidades: 0,
    construcao: 0,
    estilo: 0,
    livre: 0,
    null: 0,
  };
  for (const i of items) {
    const key = i.group_name ?? 'null';
    totals[key] += Number(i.total);
  }

  const totalOut = Object.values(totals).reduce((s, v) => s + v, 0);
  const semNoIncome = totalIncome === 0;

  const groups: CategoryGroup[] = ['necessidades', 'construcao', 'estilo', 'livre'];

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">
          Meu dinheiro está indo para onde eu quero?
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Distribuição por grupos Valoria · faixas de referência baseadas em vidas financeiras saudáveis
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {semNoIncome ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Registre suas receitas do mês para ver a distribuição.
            </p>
          </div>
        ) : (
          <>
            {/* Barra horizontal empilhada */}
            <StackedBar totals={totals} totalIncome={totalIncome} />

            {/* Lista de grupos com semáforo */}
            <div className="space-y-4">
              {groups.map((g) => {
                const value = totals[g];
                const pct = totalIncome > 0 ? (value / totalIncome) * 100 : 0;
                const ref = GROUP_REFERENCES[g];
                const level = calcSemaphore(pct, ref);
                return (
                  <GroupRow
                    key={g}
                    group={g}
                    value={value}
                    pct={pct}
                    level={level}
                    referenceMin={ref.min}
                    referenceMax={ref.max}
                  />
                );
              })}

              {totals.null > 0 && (
                <div className="pt-3 border-t border-border/40">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-muted-foreground italic">
                      Sem grupo classificado
                    </span>
                    <span className="num text-muted-foreground">
                      {formatMoney(totals.null)} ·{' '}
                      {((totals.null / totalIncome) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Classifique essas categorias em Categorias para incluí-las na distribuição Valoria.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StackedBar({
  totals,
  totalIncome,
}: {
  totals: Record<CategoryGroup | 'null', number>;
  totalIncome: number;
}) {
  const pct = (v: number) => (totalIncome > 0 ? (v / totalIncome) * 100 : 0);

  return (
    <div>
      <div className="h-3 w-full rounded-full overflow-hidden bg-muted flex">
        <div
          className="bg-primary transition-all"
          style={{ width: `${Math.min(pct(totals.necessidades), 100)}%` }}
          title={`Necessidades: ${pct(totals.necessidades).toFixed(1)}%`}
        />
        <div
          className="bg-accent transition-all"
          style={{ width: `${Math.min(pct(totals.construcao), 100)}%` }}
          title={`Construção: ${pct(totals.construcao).toFixed(1)}%`}
        />
        <div
          className="bg-secondary transition-all"
          style={{ width: `${Math.min(pct(totals.estilo), 100)}%` }}
          title={`Estilo de vida: ${pct(totals.estilo).toFixed(1)}%`}
        />
        <div
          className="bg-muted-foreground/50 transition-all"
          style={{ width: `${Math.min(pct(totals.livre), 100)}%` }}
          title={`Livre: ${pct(totals.livre).toFixed(1)}%`}
        />
      </div>
    </div>
  );
}

function GroupRow({
  group,
  value,
  pct,
  level,
  referenceMin,
  referenceMax,
}: {
  group: CategoryGroup;
  value: number;
  pct: number;
  level: SemaphoreLevel;
  referenceMin: number;
  referenceMax: number;
}) {
  const style = SEMAPHORE_STYLES[level];

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn('h-2.5 w-2.5 rounded-full shrink-0', style.dot)}
            aria-hidden
          />
          <span className="font-medium text-sm truncate">
            {GROUP_LABELS[group]}
          </span>
          <span
            className={cn(
              'shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wide',
              style.bg,
              style.text,
            )}
          >
            {style.label}
          </span>
        </div>
        <div className="text-right shrink-0 ml-2">
          <span className="num text-sm font-medium">{formatMoney(value)}</span>
          <span className="num text-xs text-muted-foreground ml-2">{pct.toFixed(0)}%</span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed pl-4">
        {GROUP_DESCRIPTIONS[group]} <span className="text-muted-foreground/70">Faixa Valoria: {referenceMin}–{referenceMax}%.</span>
      </p>
    </div>
  );
}
