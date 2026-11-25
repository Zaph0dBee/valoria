import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { transferView } from '@/lib/transfers';
import type { TransactionKind, TransferReason } from '@/types/database';

type Item = {
  id: string;
  occurred_on: string;
  amount: number;
  kind: TransactionKind;
  description: string;
  profile_id: string;
  counterpart_profile_id: string | null;
  transfer_reason: TransferReason | null;
  categories: { name: string; color: string } | null;
};

export function RecentTransactions({
  items,
  viewProfileId,
  profileNames,
}: {
  items: Item[];
  /** null no Consolidado. */
  viewProfileId: string | null;
  profileNames: Record<string, string>;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Últimos lançamentos</CardTitle>
        <Link href="/transacoes" className="text-xs text-muted-foreground hover:text-foreground">
          Ver todos →
        </Link>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Nenhum lançamento ainda.{' '}
            <Link href="/transacoes?new=1" className="text-primary underline-offset-4 hover:underline">
              Adicionar o primeiro
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-border/50 -mx-6">
            {items.map((t) => {
              const transfer =
                t.kind === 'transferencia' && t.counterpart_profile_id && t.transfer_reason
                  ? transferView(
                      {
                        profile_id: t.profile_id,
                        counterpart_profile_id: t.counterpart_profile_id,
                        transfer_reason: t.transfer_reason,
                        amount: Number(t.amount),
                      },
                      viewProfileId,
                      profileNames,
                    )
                  : null;
              const sign = transfer
                ? transfer.sign === 1 ? '+' : transfer.sign === -1 ? '−' : ''
                : t.kind === 'despesa' || t.kind === 'reserva' ? '−' : '+';
              return (
              <li key={t.id} className="flex items-center justify-between px-6 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="swatch h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: t.categories?.color || 'hsl(var(--muted-foreground))' }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{t.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(t.occurred_on, { day: '2-digit', month: 'short' })}
                      {t.categories?.name && <> · {t.categories.name}</>}
                      {transfer && <> · {transfer.label}</>}
                    </p>
                  </div>
                </div>
                <span
                  className={cn(
                    'text-sm font-medium num tabular-nums shrink-0 ml-3',
                    t.kind === 'receita' && 'text-positive',
                    t.kind === 'despesa' && 'text-destructive',
                    t.kind === 'reserva' && 'text-primary',
                    transfer?.sign === 1 && 'text-positive',
                    transfer?.sign === -1 && 'text-destructive',
                    transfer?.sign === 0 && 'text-muted-foreground',
                  )}
                >
                  {sign}
                  {formatMoney(Number(t.amount)).replace('R$', 'R$ ')}
                </span>
              </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
