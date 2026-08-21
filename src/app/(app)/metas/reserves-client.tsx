'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toaster';
import { archiveReserve, createReserve, updateReserveAmount } from '@/actions/reserves';
import { formatDate, formatMoney } from '@/lib/format';
import type { Reserve } from '@/types/database';

export function ReservesClient({ reserves }: { reserves: Reserve[] }) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function handleAmountChange(id: string, current: number, delta: number) {
    const newAmount = Math.max(0, current + delta);
    const res = await updateReserveAmount(id, newAmount);
    if (res.error) {
      toast({ variant: 'destructive', title: 'Erro', description: res.error });
    } else {
      router.refresh();
    }
  }

  async function handleArchive(id: string) {
    if (!confirm('Arquivar esta meta?')) return;
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
            const target = Number(r.target_amount);
            const pct = Math.min(100, (current / target) * 100);
            return (
              <Card key={r.id} className="p-6 group">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: r.color }} />
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
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="mb-3">
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="num font-display text-2xl">{formatMoney(current)}</span>
                    <span className="text-sm text-muted-foreground num">
                      de {formatMoney(target)}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: r.color,
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 num">{pct.toFixed(1)}% concluído</p>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => handleAmountChange(r.id, current, 100)}>
                    +100
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleAmountChange(r.id, current, 500)}>
                    +500
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleAmountChange(r.id, current, 1000)}>
                    +1000
                  </Button>
                  <CustomAmount id={r.id} current={current} onChange={handleAmountChange} />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <NewReserveDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function CustomAmount({
  id,
  current,
  onChange,
}: {
  id: string;
  current: number;
  onChange: (id: string, current: number, delta: number) => void;
}) {
  const [value, setValue] = React.useState('');
  return (
    <div className="flex-1 flex gap-1">
      <Input
        type="text"
        inputMode="decimal"
        placeholder="Outro valor"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-9"
      />
      <Button
        size="sm"
        variant="secondary"
        onClick={() => {
          const n = Number(value.replace(',', '.'));
          if (!isNaN(n) && n !== 0) {
            onChange(id, current, n);
            setValue('');
          }
        }}
      >
        +
      </Button>
    </div>
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
      target_amount: Number(String(fd.get('target_amount')).replace(',', '.')),
      current_amount: Number(String(fd.get('current_amount') || '0').replace(',', '.')),
      target_date: (fd.get('target_date') as string) || null,
      color: (fd.get('color') as string) || '#1e3a5f',
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
              <Label htmlFor="current_amount">Já reservado (R$)</Label>
              <Input id="current_amount" name="current_amount" type="text" inputMode="decimal" placeholder="0,00" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="target_date">Prazo</Label>
              <Input id="target_date" name="target_date" type="date" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="color">Cor</Label>
              <Input id="color" name="color" type="color" defaultValue="#1e3a5f" className="h-10 p-1" />
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
