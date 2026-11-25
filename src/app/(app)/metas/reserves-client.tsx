'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, ArrowUpRight, PencilLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import { archiveReserve, createReserve, updateReserveStartingAmount } from '@/actions/reserves';
import { formatDate, formatMoney, formatPercent } from '@/lib/format';
import type { Reserve } from '@/types/database';
import { parseMoney, formatMoneyInput } from '@/lib/money';

export function ReservesClient({ reserves }: { reserves: Reserve[] }) {
  const [open, setOpen] = React.useState(false);
  const [adjusting, setAdjusting] = React.useState<Reserve | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  async function handleArchive(id: string) {
    if (!confirm('Arquivar esta meta? Os aportes existentes serão preservados.')) return;
    const res = await archiveReserve(id);
    if (res.error) {
      toast({ variant: 'destructive', title: 'Erro', description: res.error });
    } else {
      toast({ title: 'Meta arquivada' });
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          Nova meta
        </Button>
      </div>

      {reserves.length === 0 ? (
        <div className="border border-dashed rounded-lg py-16 text-center">
          <p className="text-sm text-muted-foreground mb-4">
            Nenhuma meta ainda. Uma reserva de emergência é um bom começo.
          </p>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Primeira meta
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {reserves.map((r) => {
            const current = Number(r.current_amount);
            const starting = Number(r.starting_amount);
            const contributions = Math.max(0, current - starting);
            const target = Number(r.target_amount);
            const pct = Math.min(100, (current / target) * 100);

            return (
              <Card key={r.id} className="p-6 group">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="swatch h-3 w-3 rounded-full" style={{ backgroundColor: r.color }} />
                    <div>
                      <h3 className="font-display text-xl">{r.name}</h3>
                      {r.target_date && (
                        <p className="text-xs text-muted-foreground">
                          até {formatDate(r.target_date, { month: 'short', year: 'numeric' })}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100"
                    onClick={() => handleArchive(r.id)}
                    title="Arquivar meta"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="mb-4">
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="num font-display text-2xl">{formatMoney(current)}</span>
                    <span className="text-sm text-muted-foreground num">
                      de {formatMoney(target)}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="swatch h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: r.color }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
                    <span className="num">{formatPercent(pct, 1)} concluído</span>
                    {contributions > 0 && <span>{formatMoney(contributions)} em aportes vinculados</span>}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t border-border/50">
                  <Button size="sm" asChild>
                    <Link href={`/transacoes?new=1&kind=reserva&reserve=${r.id}`}>
                      <ArrowUpRight className="h-3.5 w-3.5" />
                      Registrar aporte
                    </Link>
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setAdjusting(r)}>
                    <PencilLine className="h-3.5 w-3.5" />
                    Ajustar saldo-base
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <NewReserveDialog open={open} onOpenChange={setOpen} />
      <AdjustStartingAmountDialog reserve={adjusting} onOpenChange={(isOpen) => !isOpen && setAdjusting(null)} />
    </div>
  );
}

function AdjustStartingAmountDialog({
  reserve,
  onOpenChange,
}: {
  reserve: Reserve | null;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!reserve) return;

    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const value = parseMoney(fd.get('starting_amount')) ?? Number.NaN;
    const res = await updateReserveStartingAmount(reserve.id, value);
    setLoading(false);

    if (res.error) {
      toast({ variant: 'destructive', title: 'Erro', description: res.error });
      return;
    }

    toast({ title: 'Saldo-base atualizado' });
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={reserve !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajustar saldo-base</DialogTitle>
          <DialogDescription>
            Use isto para informar o valor que já existia antes dos aportes registrados no sistema. Os aportes vinculados continuam sendo somados automaticamente.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="starting_amount">Saldo-base (R$)</Label>
            <Input
              id="starting_amount"
              name="starting_amount"
              type="text"
              inputMode="decimal"
              defaultValue={formatMoneyInput(reserve?.starting_amount ?? 0)}
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Salvando…' : 'Salvar'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewReserveDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const res = await createReserve({
      name: fd.get('name') as string,
      target_amount: parseMoney(fd.get('target_amount')) ?? Number.NaN,
      starting_amount: parseMoney(fd.get('starting_amount') || '0') ?? Number.NaN,
      target_date: (fd.get('target_date') as string) || null,
      color: (fd.get('color') as string) || '#B99154',
    });
    setLoading(false);
    if (res.error) {
      toast({ variant: 'destructive', title: 'Erro', description: res.error });
      return;
    }
    toast({ title: 'Meta criada' });
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova meta</DialogTitle>
          <DialogDescription>
            O saldo-base representa o que você já acumulou. Depois, registre novos valores como aportes para atualizar a meta automaticamente.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" name="name" required autoFocus placeholder="Ex.: Reserva de emergência" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="target_amount">Objetivo (R$)</Label>
              <Input id="target_amount" name="target_amount" type="text" inputMode="decimal" required placeholder="10000,00" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="starting_amount">Já acumulado (R$)</Label>
              <Input id="starting_amount" name="starting_amount" type="text" inputMode="decimal" placeholder="0,00" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="target_date">Prazo</Label>
              <Input id="target_date" name="target_date" type="date" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="color">Cor</Label>
              <Input id="color" name="color" type="color" defaultValue="#B99154" className="h-10 p-1" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Criando…' : 'Criar meta'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
