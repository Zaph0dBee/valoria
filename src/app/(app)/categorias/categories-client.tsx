'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { archiveCategory, createCategory, createSubcategory } from '@/actions/categories';
import type { TransactionKind } from '@/types/database';
import { cn } from '@/lib/utils';

type Cat = { id: string; name: string; kind: TransactionKind; color: string; sort_order: number };
type Sub = { id: string; category_id: string; name: string; sort_order: number };

const PRESET_COLORS = [
  '#1e3a5f', '#0f766e', '#b45309', '#7c2d12', '#a16207',
  '#9333ea', '#0369a1', '#be123c', '#4338ca', '#0891b2', '#65a30d', '#78716c',
];

const KIND_LABELS: Record<TransactionKind, string> = {
  receita: 'Receitas',
  despesa: 'Despesas',
  reserva: 'Reservas',
};

export function CategoriesClient({
  categories,
  subcategories,
}: {
  categories: Cat[];
  subcategories: Sub[];
}) {
  const [newCatKind, setNewCatKind] = React.useState<TransactionKind | null>(null);
  const [subCatFor, setSubCatFor] = React.useState<Cat | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  async function handleArchive(id: string) {
    if (!confirm('Arquivar esta categoria? Lançamentos existentes serão preservados.')) return;
    const res = await archiveCategory(id);
    if (res.error) {
      toast({ variant: 'destructive', title: 'Erro', description: res.error });
    } else {
      toast({ title: 'Categoria arquivada' });
      router.refresh();
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-3">
      {(['receita', 'despesa', 'reserva'] as const).map((kind) => {
        const cats = categories.filter((c) => c.kind === kind);
        return (
          <Card key={kind}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">{KIND_LABELS[kind]}</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => setNewCatKind(kind)}>
                <Plus className="h-3.5 w-3.5" />
                Nova
              </Button>
            </CardHeader>
            <CardContent>
              {cats.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma ainda.</p>
              ) : (
                <ul className="space-y-1">
                  {cats.map((c) => {
                    const subs = subcategories.filter((s) => s.category_id === c.id);
                    return (
                      <li key={c.id} className="group">
                        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted transition-colors">
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: c.color }}
                          />
                          <span className="text-sm flex-1 truncate">{c.name}</span>
                          {subs.length > 0 && (
                            <span className="text-xs text-muted-foreground">{subs.length}</span>
                          )}
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => setSubCatFor(c)}
                              title="Adicionar subcategoria"
                            >
                              <ChevronRight className="h-3 w-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 text-muted-foreground hover:text-destructive"
                              onClick={() => handleArchive(c.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        {subs.length > 0 && (
                          <ul className="pl-6 mt-0.5">
                            {subs.map((s) => (
                              <li key={s.id} className="text-xs text-muted-foreground py-0.5">
                                · {s.name}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Dialog nova categoria */}
      <NewCategoryDialog
        open={newCatKind !== null}
        onOpenChange={(o) => !o && setNewCatKind(null)}
        kind={newCatKind}
      />

      {/* Dialog nova subcategoria */}
      <NewSubcategoryDialog
        open={subCatFor !== null}
        onOpenChange={(o) => !o && setSubCatFor(null)}
        category={subCatFor}
      />
    </div>
  );
}

function NewCategoryDialog({
  open,
  onOpenChange,
  kind,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kind: TransactionKind | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);
  const [color, setColor] = React.useState(PRESET_COLORS[0]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!kind) return;
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const res = await createCategory({
      name: fd.get('name') as string,
      kind,
      color,
    });
    setLoading(false);
    if (res.error) {
      toast({ variant: 'destructive', title: 'Erro', description: res.error });
      return;
    }
    toast({ title: 'Categoria criada' });
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova categoria de {kind ?? ''}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" name="name" required autoFocus placeholder="Ex.: Casa, Alimentação, Educação…" />
          </div>
          <div className="space-y-2">
            <Label>Cor</Label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    'h-8 w-8 rounded-full border-2 transition-transform',
                    color === c ? 'border-foreground scale-110' : 'border-transparent',
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={`Cor ${c}`}
                />
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Criando…' : 'Criar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewSubcategoryDialog({
  open,
  onOpenChange,
  category,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  category: Cat | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!category) return;
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const res = await createSubcategory({
      category_id: category.id,
      name: fd.get('name') as string,
    });
    setLoading(false);
    if (res.error) {
      toast({ variant: 'destructive', title: 'Erro', description: res.error });
      return;
    }
    toast({ title: 'Subcategoria criada' });
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova subcategoria em {category?.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sub-name">Nome</Label>
            <Input id="sub-name" name="name" required autoFocus placeholder="Ex.: Supermercado, Padaria…" />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Criando…' : 'Criar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
