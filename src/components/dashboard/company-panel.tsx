'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toaster';
import { formatMoney } from '@/lib/format';
import { parseMoney } from '@/lib/money';
import { profitSuggestion } from '@/lib/profit';
import { registerProfitDistribution } from '@/actions/profit';
import { cn } from '@/lib/utils';

type CompanySummary = {
  total_receita: number;
  total_despesa: number;
  resultado_operacional: number;
  pro_labore_pago?: number;
  lucros_distribuidos?: number;
};

export function CompanyPanel({
  summary,
  taxTotal,
  profileId,
  defaultDate,
}: {
  summary: CompanySummary;
  taxTotal: number;
  profileId: string;
  /** Data sugerida para o registro do lucro (hoje, ou o último dia do mês visto). */
  defaultDate: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);
  const [custom, setCustom] = React.useState(false);
  const [amount, setAmount] = React.useState('');
  const [date, setDate] = React.useState(defaultDate);

  const receita = Number(summary.total_receita ?? 0);
  const despesa = Number(summary.total_despesa ?? 0);
  const impostos = Math.min(Number(taxTotal ?? 0), despesa);
  const proLabore = Number(summary.pro_labore_pago ?? 0);
  const s = profitSuggestion({
    resultado_operacional: Number(summary.resultado_operacional ?? 0),
    lucros_distribuidos: Number(summary.lucros_distribuidos ?? 0),
  });

  async function register(value: number, occurredOn: string, suggested: boolean) {
    setLoading(true);
    const res = await registerProfitDistribution({
      profile_id: profileId,
      amount: value,
      occurred_on: occurredOn,
      suggested,
    }).finally(() => setLoading(false));
    if ('error' in res) {
      toast({ variant: 'destructive', title: 'Erro', description: res.error });
      return;
    }
    toast({ title: 'Lucro registrado' });
    setCustom(false);
    setAmount('');
    router.refresh();
  }

  function submitCustom(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = parseMoney(amount);
    if (!value || value <= 0) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Informe um valor válido' });
      return;
    }
    void register(value, date, false);
  }

  const rows: { label: string; value: number; positive?: boolean }[] = [
    { label: 'Faturamento', value: receita, positive: true },
    { label: 'Custos', value: despesa - impostos },
    { label: 'Impostos', value: impostos },
    { label: 'Pró-labore', value: proLabore },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card className="p-6">
        <p className="eyebrow mb-4">resultado da empresa</p>
        <dl className="space-y-2 text-sm">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between" data-testid={`company-${r.label.toLowerCase()}`}>
              <dt className="text-muted-foreground">{r.label}</dt>
              <dd className={cn('num', r.positive && 'text-positive')}>
                {!r.positive && r.value > 0 ? '−' : ''}
                {formatMoney(r.value)}
              </dd>
            </div>
          ))}
          <div className="flex items-center justify-between border-t pt-2 font-medium" data-testid="company-resultado">
            <dt>Resultado</dt>
            <dd className={cn('num', s.resultado >= 0 ? 'text-positive' : 'text-destructive')}>{formatMoney(s.resultado)}</dd>
          </div>
          <div className="flex items-center justify-between" data-testid="company-lucros">
            <dt className="text-muted-foreground">Lucros já distribuídos</dt>
            <dd className="num">{formatMoney(s.distribuido)}</dd>
          </div>
        </dl>
      </Card>

      <Card className="p-6 bg-paper" data-testid="company-disponivel">
        <p className="eyebrow mb-2">Disponível para distribuir</p>
        <p className={cn('font-display text-4xl num tracking-tight', s.sugerir ? 'text-positive' : 'text-muted-foreground')}>
          {formatMoney(s.disponivel)}
        </p>
        {s.sugerir ? (
          <>
            <p className="mt-2 text-xs text-muted-foreground">
              Resultado do mês menos os lucros já retirados. Registrar cria uma transferência de lucros para você (PF).
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button disabled={loading} onClick={() => void register(s.disponivel, defaultDate, true)}>
                Registrar lucro de {formatMoney(s.disponivel)}
              </Button>
              <Button variant="outline" disabled={loading} onClick={() => setCustom((v) => !v)}>
                Outro valor
              </Button>
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            {s.resultado <= 0
              ? 'Sem lucro para distribuir neste mês: o resultado está zerado ou negativo.'
              : 'Sem lucro para distribuir: o resultado do mês já foi todo retirado.'}
          </p>
        )}
        {custom && s.sugerir && (
          <form onSubmit={submitCustom} className="mt-4 grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="profit-amount">Valor</Label>
              <Input id="profit-amount" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="profit-date">Data</Label>
              <Input id="profit-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <Button type="submit" disabled={loading} className="col-span-2">
              Registrar lucro
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
