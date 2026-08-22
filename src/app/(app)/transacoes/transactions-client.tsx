'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Target } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/toaster';
import { createTransaction, deleteTransaction, updateTransaction } from '@/actions/transactions';
import { formatDate, formatMoney, todayISO } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { TransactionKind } from '@/types/database';

type Tx = {
  id: string;
  occurred_on: string;
  amount: number;
  kind: TransactionKind;
  description: string;
  notes: string | null;
  category_id: string | null;
  subcategory_id: string | null;
  reserve_id: string | null;
  categories: { name: string; color: string } | null;
  reserves: { name: string } | null;
};

type Cat = { id: string; name: string; kind: TransactionKind; color: string };
type Sub = { id: string; category_id: string; name: string };
type ReserveOption = { id: string; name: string };

const KIND_LABELS: Record<TransactionKind, string> = {
  receita: 'Receita',
  despesa: 'Despesa',
  reserva: 'Aporte',
};

export function TransactionsClient({
  initialTransactions,
  categories,
  subcategories,
  reserves,
  openNewOnMount,
  initialKind,
  initialReserveId,
}: {
  initialTransactions: Tx[];
  categories: Cat[];
  subcategories: Sub[];
  reserves: ReserveOption[];
  openNewOnMount: boolean;
  initialKind?: TransactionKind;
  initialReserveId?: string;
}) {
  const [open, setOpen] = React.useState(openNewOnMount);
  const [editing, setEditing] = React.useState<Tx | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  function openNew() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(tx: Tx) {
    setEditing(tx);
    setOpen(true);
  }

  async function handleDelete(id: string) {
    if (!confirm('Apagar este lançamento?')) return;
    const res = await deleteTransaction(id);
    if (res.error) {
      toast({ variant: 'destructive', title: 'Erro', description: res.error });
    } else {
      toast({ title: 'Lançamento apagado' });
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" />
          Novo lançamento
        </Button>
      </div>

      {initialTransactions.length === 0 ? (
        <div className="border border-dashed rounded-lg py-16 text-center">
          <p className="text-sm text-muted-foreground mb-4">
            Nenhum lançamento ainda. Comece agora.
          </p>
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" />
            Primeiro lançamento
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria / destino</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialTransactions.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell className="num text-muted-foreground text-xs">
                    {formatDate(tx.occurred_on, { day: '2-digit', month: '2-digit', year: '2-digit' })}
                  </TableCell>
                  <TableCell className="font-medium">{tx.description}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      {tx.categories ? (
                        <span className="inline-flex items-center gap-2 text-xs">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: tx.categories.color }}
                          />
                          {tx.categories.name}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Sem categoria</span>
                      )}
                      {tx.kind === 'reserva' && tx.reserves && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Target className="h-3 w-3" />
                          {tx.reserves.name}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right num font-medium',
                      tx.kind === 'receita' && 'text-positive',
                      tx.kind === 'despesa' && 'text-destructive',
                      tx.kind === 'reserva' && 'text-primary',
                    )}
                  >
                    {tx.kind === 'despesa' || tx.kind === 'reserva' ? '−' : '+'}
                    {formatMoney(Number(tx.amount))}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(tx)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDelete(tx.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <TransactionDialog
        open={open}
        onOpenChange={setOpen}
        categories={categories}
        subcategories={subcategories}
        reserves={reserves}
        editing={editing}
        initialKind={initialKind}
        initialReserveId={initialReserveId}
      />
    </div>
  );
}

function TransactionDialog({
  open,
  onOpenChange,
  categories,
  subcategories,
  reserves,
  editing,
  initialKind,
  initialReserveId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  categories: Cat[];
  subcategories: Sub[];
  reserves: ReserveOption[];
  editing: Tx | null;
  initialKind?: TransactionKind;
  initialReserveId?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);
  const [kind, setKind] = React.useState<TransactionKind>(editing?.kind ?? initialKind ?? 'despesa');
  const [categoryId, setCategoryId] = React.useState<string>(editing?.category_id ?? '');
  const [subcategoryId, setSubcategoryId] = React.useState<string>(editing?.subcategory_id ?? '');
  const [reserveId, setReserveId] = React.useState<string>(editing?.reserve_id ?? initialReserveId ?? '');

  React.useEffect(() => {
    if (open) {
      const nextKind = editing?.kind ?? initialKind ?? 'despesa';
      const suggestedReserve = !editing && nextKind === 'reserva' && reserves.some((r) => r.id === initialReserveId)
        ? initialReserveId ?? ''
        : '';
      setKind(nextKind);
      setCategoryId(editing?.category_id ?? '');
      setSubcategoryId(editing?.subcategory_id ?? '');
      setReserveId(editing?.reserve_id ?? suggestedReserve);
    }
  }, [open, editing, initialKind, initialReserveId, reserves]);

  const filteredCategories = categories.filter((c) => c.kind === kind);
  const filteredSubs = subcategories.filter((s) => s.category_id === categoryId);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      occurred_on: fd.get('occurred_on') as string,
      amount: Number(String(fd.get('amount')).replace(',', '.')),
      kind,
      category_id: categoryId || null,
      subcategory_id: subcategoryId || null,
      reserve_id: kind === 'reserva' ? reserveId || null : null,
      description: fd.get('description') as string,
      notes: (fd.get('notes') as string) || null,
    };

    const res = editing
      ? await updateTransaction(editing.id, payload)
      : await createTransaction(payload);

    setLoading(false);
    if (res.error) {
      toast({ variant: 'destructive', title: 'Erro', description: res.error });
      return;
    }
    toast({
      title: editing ? 'Lançamento atualizado' : kind === 'reserva' ? 'Aporte registrado' : 'Lançamento criado',
      description: kind === 'reserva' && reserveId ? 'O progresso da meta foi atualizado automaticamente.' : undefined,
    });
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar lançamento' : 'Novo lançamento'}</DialogTitle>
          <DialogDescription>
            Receitas entram no caixa, despesas reduzem o resultado e aportes constroem patrimônio.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="mb-2 block">Tipo</Label>
            <div className="grid grid-cols-3 gap-2">
              {(['receita', 'despesa', 'reserva'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setKind(k);
                    setCategoryId('');
                    setSubcategoryId('');
                    if (k !== 'reserva') setReserveId('');
                  }}
                  className={cn(
                    'py-2 px-3 rounded-md border text-sm transition-colors',
                    kind === k
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input hover:bg-muted',
                  )}
                >
                  {KIND_LABELS[k]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="occurred_on">Data</Label>
              <Input
                id="occurred_on"
                name="occurred_on"
                type="date"
                defaultValue={editing?.occurred_on ?? todayISO()}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Valor (R$)</Label>
              <Input
                id="amount"
                name="amount"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                defaultValue={editing?.amount ?? ''}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Input
              id="description"
              name="description"
              defaultValue={editing?.description ?? ''}
              placeholder={kind === 'reserva' ? 'Ex.: Aporte mensal' : 'Ex.: Supermercado'}
              required
            />
          </div>

          {kind === 'reserva' && (
            <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
              <Label>Destino do aporte</Label>
              <Select value={reserveId} onValueChange={setReserveId}>
                <SelectTrigger>
                  <SelectValue placeholder="Vincular a uma meta (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {reserves.length === 0 ? (
                    <div className="px-2 py-3 text-sm text-muted-foreground">
                      Crie uma meta para acompanhar o aporte automaticamente.
                    </div>
                  ) : (
                    reserves.map((reserve) => (
                      <SelectItem key={reserve.id} value={reserve.id}>{reserve.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Ao vincular, este valor entra automaticamente no progresso da meta.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select
                value={categoryId}
                onValueChange={(value) => {
                  setCategoryId(value);
                  setSubcategoryId('');
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sem categoria" />
                </SelectTrigger>
                <SelectContent>
                  {filteredCategories.length === 0 && (
                    <div className="px-2 py-3 text-sm text-muted-foreground">
                      Nenhuma categoria de {KIND_LABELS[kind].toLowerCase()}
                    </div>
                  )}
                  {filteredCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Subcategoria</Label>
              <Select value={subcategoryId} onValueChange={setSubcategoryId} disabled={!categoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  {filteredSubs.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Observações</Label>
            <Input id="notes" name="notes" defaultValue={editing?.notes ?? ''} placeholder="Opcional" />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvando…' : editing ? 'Atualizar' : kind === 'reserva' ? 'Registrar aporte' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
