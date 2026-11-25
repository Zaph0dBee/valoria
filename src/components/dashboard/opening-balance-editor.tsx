'use client';

import * as React from 'react';
import { PencilLine, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toaster';
import { removeMonthlyOpeningBalance, setMonthlyOpeningBalance } from '@/actions/monthly-balances';
import { parseMoney, formatMoneyInput } from '@/lib/money';

export function OpeningBalanceEditor({
  profileId,
  year,
  month,
  currentValue,
  isManual,
}: {
  profileId: string;
  year: number;
  month: number;
  currentValue: number;
  isManual: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const value = parseMoney(fd.get('opening_balance')) ?? Number.NaN;
    const res = await setMonthlyOpeningBalance({ profile_id: profileId, year, month, opening_balance: value });
    setLoading(false);

    if (res.error) {
      toast({ variant: 'destructive', title: 'Erro', description: res.error });
      return;
    }

    toast({ title: 'Saldo inicial definido' });
    setOpen(false);
    router.refresh();
  }

  async function handleAutomatic() {
    setLoading(true);
    const res = await removeMonthlyOpeningBalance(year, month, profileId);
    setLoading(false);

    if (res.error) {
      toast({ variant: 'destructive', title: 'Erro', description: res.error });
      return;
    }

    toast({ title: 'Saldo inicial voltou ao automático' });
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setOpen(true)}>
        <PencilLine className="h-3 w-3" />
        {isManual ? 'editar' : 'definir'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Saldo inicial do mês</DialogTitle>
            <DialogDescription>
              Este valor funciona como uma âncora. Se você não definir outro saldo nos meses seguintes, o sistema carrega o saldo final automaticamente.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="opening_balance">Saldo inicial (R$)</Label>
              <Input
                id="opening_balance"
                name="opening_balance"
                type="text"
                inputMode="decimal"
                defaultValue={formatMoneyInput(currentValue)}
                required
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Pode ser positivo ou negativo. Use o saldo real disponível no início do mês.
              </p>
            </div>
            <DialogFooter className="sm:justify-between">
              <div>
                {isManual && (
                  <Button type="button" variant="outline" onClick={handleAutomatic} disabled={loading}>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Usar cálculo automático
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={loading}>{loading ? 'Salvando…' : 'Salvar'}</Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
