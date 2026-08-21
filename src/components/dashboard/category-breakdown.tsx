import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMoney } from '@/lib/format';
import type { TransactionKind } from '@/types/database';

type Item = {
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
  kind: TransactionKind | null;
  total: number;
};

export function CategoryBreakdown({ items }: { items: Item[] }) {
  const despesas = items.filter((i) => i.kind === 'despesa' && Number(i.total) > 0);
  const total = despesas.reduce((s, i) => s + Number(i.total), 0);

  if (!despesas.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Despesas por categoria</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Despesas por categoria</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {despesas.map((item) => {
          const value = Number(item.total);
          const pct = (value / total) * 100;
          return (
            <div key={item.category_id ?? 'sem'} className="space-y-1.5">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">{item.category_name ?? 'Sem categoria'}</span>
                <span className="num tabular-nums text-muted-foreground">
                  <span className="text-foreground">{formatMoney(value)}</span>
                  <span className="ml-2 text-xs">{pct.toFixed(0)}%</span>
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: item.category_color || 'hsl(var(--primary))',
                  }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="py-12 text-center text-sm text-muted-foreground">
      Sem despesas neste mês ainda.
    </div>
  );
}
