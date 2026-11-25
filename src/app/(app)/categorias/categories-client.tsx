'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Trash2 } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/toaster';
import {
  archiveCategory,
  archiveSubcategory,
  createCategory,
  createSubcategory,
  updateCategory,
  updateSubcategory,
} from '@/actions/categories';
import type { CategoryGroup, TransactionKind } from '@/types/database';
import { formatMoneyCompact } from '@/lib/format';
import { cn } from '@/lib/utils';
import { parseMoney, formatMoneyInput } from '@/lib/money';

type Recurrence = 'none' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';
type ExpenseNature = 'fixa' | 'variavel';

type Cat = {
  id: string;
  name: string;
  kind: TransactionKind;
  color: string;
  sort_order: number;
  group: CategoryGroup | null;
  planned_amount: number | null;
  recurrence: Recurrence;
  day_of_month: number | null;
  expense_nature: ExpenseNature | null;
  include_in_budget: boolean;
  planning_notes: string | null;
  default_reserve_id: string | null;
};

type Sub = {
  id: string;
  category_id: string;
  name: string;
  sort_order: number;
  group_override: CategoryGroup | null;
  planned_amount: number | null;
  recurrence: Recurrence;
  day_of_month: number | null;
  expense_nature: ExpenseNature | null;
  include_in_budget: boolean;
  planning_notes: string | null;
  default_reserve_id: string | null;
};

type ReserveOption = { id: string; name: string };

const PRESET_COLORS = [
  '#1e3a5f', '#0f766e', '#b45309', '#7c2d12', '#a16207',
  '#9333ea', '#0369a1', '#be123c', '#4338ca', '#0891b2', '#65a30d', '#78716c',
];

const KIND_LABELS: Record<TransactionKind, string> = {
  receita: 'Receitas',
  despesa: 'Despesas',
  reserva: 'Construção / Aportes',
};

const GROUP_LABELS: Record<CategoryGroup, string> = {
  necessidades: 'Necessidades',
  construcao: 'Construção',
  estilo: 'Estilo de vida',
  livre: 'Livre',
};

const RECURRENCE_LABELS: Record<Recurrence, string> = {
  none: 'Sem recorrência',
  weekly: 'Semanal',
  biweekly: 'Quinzenal',
  monthly: 'Mensal',
  yearly: 'Anual',
};

function parseMoneyInput(value: string): number | null {
  const amount = parseMoney(value);
  return amount !== null && amount >= 0 ? amount : null;
}

function plannedAmountForCategory(category: Cat, subs: Sub[]): number | null {
  const activeSubAmounts = subs
    .filter((sub) => sub.include_in_budget && sub.planned_amount !== null)
    .map((sub) => sub.planned_amount ?? 0);

  if (activeSubAmounts.length > 0) {
    return activeSubAmounts.reduce((sum, amount) => sum + amount, 0);
  }
  return category.include_in_budget ? category.planned_amount : null;
}

export function CategoriesClient({
  categories,
  subcategories,
  reserves,
  profileId,
  isCompany,
}: {
  categories: Cat[];
  subcategories: Sub[];
  reserves: ReserveOption[];
  profileId: string;
  /** Empresa não tem categorias de aporte (Construção / Aportes). */
  isCompany: boolean;
}) {
  const kinds = isCompany
    ? (['receita', 'despesa'] as const)
    : (['receita', 'despesa', 'reserva'] as const);
  const [newCatKind, setNewCatKind] = React.useState<TransactionKind | null>(null);
  const [subCatFor, setSubCatFor] = React.useState<Cat | null>(null);
  const [editingCategory, setEditingCategory] = React.useState<Cat | null>(null);
  const [editingSubcategory, setEditingSubcategory] = React.useState<Sub | null>(null);
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

  async function handleArchiveSubcategory(id: string) {
    if (!confirm('Arquivar esta subcategoria? Lançamentos existentes serão preservados.')) return;
    const res = await archiveSubcategory(id);
    if (res.error) {
      toast({ variant: 'destructive', title: 'Erro', description: res.error });
    } else {
      toast({ title: 'Subcategoria arquivada' });
      router.refresh();
    }
  }

  const parentForEditingSub = editingSubcategory
    ? categories.find((category) => category.id === editingSubcategory.category_id) ?? null
    : null;

  return (
    <div className="grid gap-6 lg:grid-cols-2 2xl:grid-cols-3">
      {kinds.map((kind) => {
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
                    const planned = plannedAmountForCategory(c, subs);
                    return (
                      <li key={c.id} className="group">
                        <div className="relative flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-muted transition-colors">
                          <span
                            className="swatch h-2.5 w-2.5 rounded-full shrink-0 mt-1.5"
                            style={{ backgroundColor: c.color }}
                          />
                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              className="text-sm block w-full truncate text-left hover:underline underline-offset-4"
                              onClick={() => setEditingCategory(c)}
                              title="Editar categoria"
                            >
                              {c.name}
                            </button>
                            {planned !== null && planned > 0 && (
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                {formatMoneyCompact(planned)} planejados
                              </p>
                            )}
                          </div>
                          {subs.length > 0 && (
                            <span className="text-xs text-muted-foreground mt-0.5">{subs.length}</span>
                          )}
                          <div className="absolute right-1 top-1 flex gap-0.5 rounded-md bg-muted opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto [@media(hover:none)]:static [@media(hover:none)]:translate-y-0 [@media(hover:none)]:bg-transparent [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => setEditingCategory(c)}
                              title="Editar categoria"
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => setSubCatFor(c)}
                              title="Adicionar subcategoria"
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 text-muted-foreground hover:text-destructive"
                              onClick={() => handleArchive(c.id)}
                              title="Arquivar categoria"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        {subs.length > 0 && (
                          <ul className="pl-6 mt-0.5">
                            {subs.map((s) => (
                              <li key={s.id} className="group/sub relative flex items-center gap-1 rounded px-1 -ml-1 hover:bg-muted/60">
                                <span className="text-xs text-muted-foreground">·</span>
                                <button
                                  type="button"
                                  className="text-xs text-muted-foreground py-0.5 flex-1 min-w-0 truncate text-left hover:text-foreground hover:underline underline-offset-4"
                                  onClick={() => setEditingSubcategory(s)}
                                  title="Editar subcategoria"
                                >
                                  {s.name}
                                </button>
                                {s.include_in_budget && s.planned_amount !== null && s.planned_amount > 0 && (
                                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                    {formatMoneyCompact(s.planned_amount)}
                                  </span>
                                )}
                                <div className="absolute right-0 top-1/2 -translate-y-1/2 flex rounded bg-muted opacity-0 pointer-events-none transition-opacity group-hover/sub:opacity-100 group-hover/sub:pointer-events-auto group-focus-within/sub:opacity-100 group-focus-within/sub:pointer-events-auto [@media(hover:none)]:static [@media(hover:none)]:translate-y-0 [@media(hover:none)]:bg-transparent [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6"
                                    onClick={() => setEditingSubcategory(s)}
                                    title="Editar subcategoria"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                    onClick={() => handleArchiveSubcategory(s.id)}
                                    title="Arquivar subcategoria"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
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

      <NewCategoryDialog
        profileId={profileId}
        open={newCatKind !== null}
        onOpenChange={(open) => !open && setNewCatKind(null)}
        kind={newCatKind}
      />

      <NewSubcategoryDialog
        open={subCatFor !== null}
        onOpenChange={(open) => !open && setSubCatFor(null)}
        category={subCatFor}
      />

      <EditCategoryDialog
        open={editingCategory !== null}
        onOpenChange={(open) => !open && setEditingCategory(null)}
        category={editingCategory}
        reserves={reserves}
      />

      <EditSubcategoryDialog
        open={editingSubcategory !== null}
        onOpenChange={(open) => !open && setEditingSubcategory(null)}
        subcategory={editingSubcategory}
        parentCategory={parentForEditingSub}
        reserves={reserves}
      />
    </div>
  );
}

function NewCategoryDialog({
  profileId,
  open,
  onOpenChange,
  kind,
}: {
  profileId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: TransactionKind | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);
  const [color, setColor] = React.useState(PRESET_COLORS[0]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!kind) return;
    setLoading(true);
    const formData = new FormData(event.currentTarget);
    const res = await createCategory({
      profile_id: profileId,
      name: formData.get('name') as string,
      kind,
      color,
    });
    setLoading(false);
    if (res.error) {
      toast({ variant: 'destructive', title: 'Erro', description: res.error });
      return;
    }
    toast({ title: 'Categoria criada', description: 'Agora você pode abrir a categoria e configurar o planejamento.' });
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova categoria de {kind ? KIND_LABELS[kind].toLowerCase() : ''}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" name="name" required autoFocus placeholder="Ex.: Casa, Alimentação, Educação…" />
          </div>
          <ColorPicker color={color} setColor={setColor} />
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
  onOpenChange: (open: boolean) => void;
  category: Cat | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!category) return;
    setLoading(true);
    const formData = new FormData(event.currentTarget);
    const res = await createSubcategory({
      category_id: category.id,
      name: formData.get('name') as string,
    });
    setLoading(false);
    if (res.error) {
      toast({ variant: 'destructive', title: 'Erro', description: res.error });
      return;
    }
    toast({ title: 'Subcategoria criada', description: 'Abra a subcategoria para definir valor, recorrência e classificação.' });
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

function ColorPicker({ color, setColor }: { color: string; setColor: (color: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>Cor</Label>
      <div className="flex flex-wrap gap-2">
        {PRESET_COLORS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setColor(preset)}
            className={cn(
              'h-8 w-8 rounded-full border-2 transition-transform',
              color === preset ? 'border-foreground scale-110' : 'border-transparent',
            )}
            style={{ backgroundColor: preset }}
            aria-label={`Cor ${preset}`}
          />
        ))}
      </div>
    </div>
  );
}

function PlanningFields({
  kind,
  groupValue,
  setGroupValue,
  allowInheritedGroup = false,
  plannedAmount,
  setPlannedAmount,
  recurrence,
  setRecurrence,
  dayOfMonth,
  setDayOfMonth,
  expenseNature,
  setExpenseNature,
  includeInBudget,
  setIncludeInBudget,
  planningNotes,
  setPlanningNotes,
  defaultReserveId,
  setDefaultReserveId,
  reserves,
}: {
  kind: TransactionKind;
  groupValue: CategoryGroup | 'none' | 'inherit';
  setGroupValue: (value: CategoryGroup | 'none' | 'inherit') => void;
  allowInheritedGroup?: boolean;
  plannedAmount: string;
  setPlannedAmount: (value: string) => void;
  recurrence: Recurrence;
  setRecurrence: (value: Recurrence) => void;
  dayOfMonth: string;
  setDayOfMonth: (value: string) => void;
  expenseNature: ExpenseNature | 'none';
  setExpenseNature: (value: ExpenseNature | 'none') => void;
  includeInBudget: boolean;
  setIncludeInBudget: (value: boolean) => void;
  planningNotes: string;
  setPlanningNotes: (value: string) => void;
  defaultReserveId: string;
  setDefaultReserveId: (value: string) => void;
  reserves: ReserveOption[];
}) {
  const amountLabel = kind === 'receita'
    ? 'Valor previsto mensal'
    : kind === 'despesa'
      ? 'Valor planejado mensal'
      : 'Aporte mensal planejado';
  const dayLabel = kind === 'receita' ? 'Dia previsto de recebimento' : 'Dia previsto / vencimento';

  return (
    <div className="space-y-4 border-t border-border pt-4">
      <div>
        <p className="text-sm font-medium">Planejamento</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Estes valores são referências. O realizado continua sendo calculado pelos lançamentos.
        </p>
      </div>

      {kind !== 'receita' && (
        <div className="space-y-2">
          <Label>Grupo Valoria / NCE</Label>
          <Select value={groupValue} onValueChange={(value) => setGroupValue(value as CategoryGroup | 'none' | 'inherit')}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allowInheritedGroup ? (
                <SelectItem value="inherit">Herdar da categoria</SelectItem>
              ) : kind === 'despesa' ? (
                <SelectItem value="none">Sem classificação</SelectItem>
              ) : null}
              {(Object.keys(GROUP_LABELS) as CategoryGroup[]).map((group) => (
                <SelectItem key={group} value={group}>{GROUP_LABELS[group]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {allowInheritedGroup && (
            <p className="text-[11px] text-muted-foreground">
              Use uma classificação própria quando uma subcategoria tiver comportamento diferente do grupo principal.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="planned-amount">{amountLabel}</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
            <Input
              id="planned-amount"
              value={plannedAmount}
              onChange={(event) => setPlannedAmount(event.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              className="pl-10"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Recorrência</Label>
          <Select value={recurrence} onValueChange={(value) => setRecurrence(value as Recurrence)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(RECURRENCE_LABELS) as Recurrence[]).map((item) => (
                <SelectItem key={item} value={item}>{RECURRENCE_LABELS[item]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="day-of-month">{dayLabel}</Label>
          <Input
            id="day-of-month"
            type="number"
            min={1}
            max={31}
            value={dayOfMonth}
            onChange={(event) => setDayOfMonth(event.target.value)}
            placeholder="Ex.: 10"
          />
          <p className="text-[11px] text-muted-foreground">Opcional. Use de 1 a 31.</p>
        </div>

        {kind === 'despesa' && (
          <div className="space-y-2">
            <Label>Tipo do gasto</Label>
            <Select value={expenseNature} onValueChange={(value) => setExpenseNature(value as ExpenseNature | 'none')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Não definido</SelectItem>
                <SelectItem value="fixa">Fixa</SelectItem>
                <SelectItem value="variavel">Variável</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {kind === 'reserva' && (
        <div className="space-y-2">
          <Label>Meta vinculada</Label>
          <Select value={defaultReserveId} onValueChange={setDefaultReserveId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhuma meta vinculada</SelectItem>
              {reserves.map((reserve) => (
                <SelectItem key={reserve.id} value={reserve.id}>{reserve.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            Esta será a meta sugerida para novos aportes desta categoria. O vínculo do lançamento continua editável.
          </p>
        </div>
      )}

      <label className="flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer">
        <input
          type="checkbox"
          checked={includeInBudget}
          onChange={(event) => setIncludeInBudget(event.target.checked)}
          className="mt-0.5 h-4 w-4 accent-current"
        />
        <span>
          <span className="block text-sm font-medium">Considerar no orçamento</span>
          <span className="block text-xs text-muted-foreground mt-0.5">
            Quando ativado, este planejamento poderá ser usado na tela de Orçamento da próxima etapa.
          </span>
        </span>
      </label>

      <div className="space-y-2">
        <Label htmlFor="planning-notes">Observações</Label>
        <textarea
          id="planning-notes"
          value={planningNotes}
          onChange={(event) => setPlanningNotes(event.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Ex.: reajusta em janeiro, valor médio dos últimos meses…"
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </div>
    </div>
  );
}

function EditCategoryDialog({
  open,
  onOpenChange,
  category,
  reserves,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: Cat | null;
  reserves: ReserveOption[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);
  const [name, setName] = React.useState('');
  const [color, setColor] = React.useState(PRESET_COLORS[0]);
  const [group, setGroup] = React.useState<CategoryGroup | 'none'>('none');
  const [plannedAmount, setPlannedAmount] = React.useState('');
  const [recurrence, setRecurrence] = React.useState<Recurrence>('none');
  const [dayOfMonth, setDayOfMonth] = React.useState('');
  const [expenseNature, setExpenseNature] = React.useState<ExpenseNature | 'none'>('none');
  const [includeInBudget, setIncludeInBudget] = React.useState(true);
  const [planningNotes, setPlanningNotes] = React.useState('');
  const [defaultReserveId, setDefaultReserveId] = React.useState('none');

  React.useEffect(() => {
    if (!category) return;
    setName(category.name);
    setColor(category.color);
    setGroup(category.group ?? (category.kind === 'reserva' ? 'construcao' : 'none'));
    setPlannedAmount(formatMoneyInput(category.planned_amount));
    setRecurrence(category.recurrence);
    setDayOfMonth(category.day_of_month ? String(category.day_of_month) : '');
    setExpenseNature(category.expense_nature ?? 'none');
    setIncludeInBudget(category.include_in_budget);
    setPlanningNotes(category.planning_notes ?? '');
    setDefaultReserveId(category.default_reserve_id ?? 'none');
  }, [category]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!category) return;
    const amount = parseMoneyInput(plannedAmount);
    if (plannedAmount.trim() && amount === null) {
      toast({ variant: 'destructive', title: 'Valor inválido', description: 'Informe um valor planejado válido.' });
      return;
    }

    setLoading(true);
    const res = await updateCategory(category.id, {
      name,
      color,
      group: category.kind === 'receita' ? null : group === 'none' ? null : group,
      planned_amount: amount,
      recurrence,
      day_of_month: dayOfMonth ? Number(dayOfMonth) : null,
      expense_nature: category.kind === 'despesa' && expenseNature !== 'none' ? expenseNature : null,
      include_in_budget: includeInBudget,
      planning_notes: planningNotes.trim() || null,
      default_reserve_id: category.kind === 'reserva' && defaultReserveId !== 'none' ? defaultReserveId : null,
    });
    setLoading(false);

    if ('error' in res && res.error) {
      toast({ variant: 'destructive', title: 'Erro', description: res.error });
      return;
    }
    toast({ title: 'Categoria atualizada', description: 'Configurações de planejamento salvas.' });
    onOpenChange(false);
    router.refresh();
  }

  if (!category) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar categoria</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <Label htmlFor="edit-category-name">Nome</Label>
              <Input
                id="edit-category-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                autoFocus
                maxLength={60}
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <div className="h-10 px-3 rounded-md border border-border bg-muted/40 flex items-center text-sm min-w-36">
                {KIND_LABELS[category.kind]}
              </div>
            </div>
          </div>

          <ColorPicker color={color} setColor={setColor} />

          <PlanningFields
            kind={category.kind}
            groupValue={group}
            setGroupValue={(value) => setGroup(value === 'inherit' ? 'none' : value)}
            plannedAmount={plannedAmount}
            setPlannedAmount={setPlannedAmount}
            recurrence={recurrence}
            setRecurrence={setRecurrence}
            dayOfMonth={dayOfMonth}
            setDayOfMonth={setDayOfMonth}
            expenseNature={expenseNature}
            setExpenseNature={setExpenseNature}
            includeInBudget={includeInBudget}
            setIncludeInBudget={setIncludeInBudget}
            planningNotes={planningNotes}
            setPlanningNotes={setPlanningNotes}
            defaultReserveId={defaultReserveId}
            setDefaultReserveId={setDefaultReserveId}
            reserves={reserves}
          />

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading ? 'Salvando…' : 'Salvar alterações'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditSubcategoryDialog({
  open,
  onOpenChange,
  subcategory,
  parentCategory,
  reserves,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subcategory: Sub | null;
  parentCategory: Cat | null;
  reserves: ReserveOption[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);
  const [name, setName] = React.useState('');
  const [groupOverride, setGroupOverride] = React.useState<CategoryGroup | 'inherit'>('inherit');
  const [plannedAmount, setPlannedAmount] = React.useState('');
  const [recurrence, setRecurrence] = React.useState<Recurrence>('none');
  const [dayOfMonth, setDayOfMonth] = React.useState('');
  const [expenseNature, setExpenseNature] = React.useState<ExpenseNature | 'none'>('none');
  const [includeInBudget, setIncludeInBudget] = React.useState(true);
  const [planningNotes, setPlanningNotes] = React.useState('');
  const [defaultReserveId, setDefaultReserveId] = React.useState('none');

  React.useEffect(() => {
    if (!subcategory) return;
    setName(subcategory.name);
    setGroupOverride(subcategory.group_override ?? 'inherit');
    setPlannedAmount(formatMoneyInput(subcategory.planned_amount));
    setRecurrence(subcategory.recurrence);
    setDayOfMonth(subcategory.day_of_month ? String(subcategory.day_of_month) : '');
    setExpenseNature(subcategory.expense_nature ?? 'none');
    setIncludeInBudget(subcategory.include_in_budget);
    setPlanningNotes(subcategory.planning_notes ?? '');
    setDefaultReserveId(subcategory.default_reserve_id ?? 'none');
  }, [subcategory]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subcategory || !parentCategory) return;
    const amount = parseMoneyInput(plannedAmount);
    if (plannedAmount.trim() && amount === null) {
      toast({ variant: 'destructive', title: 'Valor inválido', description: 'Informe um valor planejado válido.' });
      return;
    }

    setLoading(true);
    const res = await updateSubcategory(subcategory.id, {
      name,
      group_override: parentCategory.kind === 'receita' || groupOverride === 'inherit' ? null : groupOverride,
      planned_amount: amount,
      recurrence,
      day_of_month: dayOfMonth ? Number(dayOfMonth) : null,
      expense_nature: parentCategory.kind === 'despesa' && expenseNature !== 'none' ? expenseNature : null,
      include_in_budget: includeInBudget,
      planning_notes: planningNotes.trim() || null,
      default_reserve_id: parentCategory.kind === 'reserva' && defaultReserveId !== 'none' ? defaultReserveId : null,
    });
    setLoading(false);

    if ('error' in res && res.error) {
      toast({ variant: 'destructive', title: 'Erro', description: res.error });
      return;
    }
    toast({ title: 'Subcategoria atualizada', description: 'Configurações de planejamento salvas.' });
    onOpenChange(false);
    router.refresh();
  }

  if (!subcategory || !parentCategory) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar subcategoria</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <Label htmlFor="edit-subcategory-name">Nome</Label>
              <Input
                id="edit-subcategory-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                autoFocus
                maxLength={80}
              />
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <div className="h-10 px-3 rounded-md border border-border bg-muted/40 flex items-center text-sm min-w-36 max-w-56 truncate">
                {parentCategory.name}
              </div>
            </div>
          </div>

          <PlanningFields
            kind={parentCategory.kind}
            groupValue={groupOverride}
            setGroupValue={(value) => setGroupOverride(value === 'none' ? 'inherit' : value as CategoryGroup | 'inherit')}
            allowInheritedGroup
            plannedAmount={plannedAmount}
            setPlannedAmount={setPlannedAmount}
            recurrence={recurrence}
            setRecurrence={setRecurrence}
            dayOfMonth={dayOfMonth}
            setDayOfMonth={setDayOfMonth}
            expenseNature={expenseNature}
            setExpenseNature={setExpenseNature}
            includeInBudget={includeInBudget}
            setIncludeInBudget={setIncludeInBudget}
            planningNotes={planningNotes}
            setPlanningNotes={setPlanningNotes}
            defaultReserveId={defaultReserveId}
            setDefaultReserveId={setDefaultReserveId}
            reserves={reserves}
          />

          {parentCategory.kind !== 'receita' && groupOverride === 'inherit' && (
            <p className="text-xs text-muted-foreground rounded-md bg-muted/40 px-3 py-2">
              Grupo herdado: {parentCategory.group ? GROUP_LABELS[parentCategory.group] : 'sem classificação'}.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading ? 'Salvando…' : 'Salvar alterações'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
