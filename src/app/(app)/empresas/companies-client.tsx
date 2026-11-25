'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Pencil, Archive, ArchiveRestore, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toaster';
import { createCompany, deleteCompany, setCompanyArchived, updateCompany } from '@/actions/profiles';
import { formatCnpj } from '@/lib/cnpj';
import type { FinancialProfile } from '@/types/database';

const COLORS = ['#B99154', '#9FA88A', '#0f766e', '#b45309', '#7c2d12', '#78716c'];

export function CompaniesClient({ companies }: { companies: FinancialProfile[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = React.useState<FinancialProfile | null>(null);
  const [open, setOpen] = React.useState(false);

  function openNew() {
    setEditing(null);
    setOpen(true);
  }

  async function run(action: () => Promise<{ error?: string; ok?: boolean }>, success: string) {
    const res = await action();
    if (res.error) {
      toast({ variant: 'destructive', title: 'Não foi possível', description: res.error });
      return false;
    }
    toast({ title: success });
    router.refresh();
    return true;
  }

  async function handleDelete(company: FinancialProfile) {
    if (!confirm(`Excluir "${company.name}"? Só é possível se ela ainda não tiver lançamentos.`)) return;
    await run(() => deleteCompany(company.id), 'Empresa excluída');
  }

  const active = companies.filter((c) => !c.archived);
  const archived = companies.filter((c) => c.archived);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" />
          Nova empresa
        </Button>
      </div>

      {companies.length === 0 ? (
        <Card className="border-dashed p-10 text-center">
          <Building2 className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Nenhuma empresa ainda. Ao cadastrar a primeira, aparece o seletor para alternar entre você e a empresa.
          </p>
          <Button className="mt-4" onClick={openNew}>
            <Plus className="h-4 w-4" />
            Cadastrar empresa
          </Button>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {[...active, ...archived].map((c) => (
            <li key={c.id}>
              <Card className={c.archived ? 'p-5 opacity-60' : 'p-5'}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="swatch h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground num">
                        {c.document ? `CNPJ ${formatCnpj(c.document)}` : 'CNPJ não informado'}
                        {c.archived && ' · arquivada'}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Editar ${c.name}`}
                      onClick={() => {
                        setEditing(c);
                        setOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={c.archived ? `Reativar ${c.name}` : `Arquivar ${c.name}`}
                      onClick={() =>
                        run(
                          () => setCompanyArchived(c.id, !c.archived),
                          c.archived ? 'Empresa reativada' : 'Empresa arquivada',
                        )
                      }
                    >
                      {c.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Excluir ${c.name}`}
                      onClick={() => handleDelete(c)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <CompanyDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        onSaved={(message) => {
          setOpen(false);
          toast({ title: message });
          router.refresh();
        }}
        onError={(message) => toast({ variant: 'destructive', title: 'Não foi possível', description: message })}
      />
    </div>
  );
}

function CompanyDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
  onError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: FinancialProfile | null;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [loading, setLoading] = React.useState(false);
  const [color, setColor] = React.useState(editing?.color ?? COLORS[0]);

  React.useEffect(() => {
    if (open) setColor(editing?.color ?? COLORS[0]);
  }, [open, editing]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get('name') ?? '');
    const document = String(fd.get('document') ?? '');
    setLoading(true);
    const res = editing
      ? await updateCompany(editing.id, { name, document, color })
      : await createCompany({ name, document, color, useTemplate: fd.get('useTemplate') === 'on' });
    setLoading(false);
    if (res.error) {
      onError(res.error);
      return;
    }
    onSaved(editing ? 'Empresa atualizada' : 'Empresa cadastrada');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar empresa' : 'Nova empresa'}</DialogTitle>
          <DialogDescription>
            Os lançamentos da empresa ficam separados dos seus. No Consolidado você vê tudo junto.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" key={editing?.id ?? 'new'}>
          <div className="space-y-2">
            <Label htmlFor="company-name">Nome da empresa</Label>
            <Input id="company-name" name="name" required maxLength={80} defaultValue={editing?.name ?? ''} placeholder="Ex.: Studio Bia LTDA" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="company-document">CNPJ (opcional)</Label>
            <Input
              id="company-document"
              name="document"
              inputMode="numeric"
              defaultValue={editing?.document ? formatCnpj(editing.document) : ''}
              placeholder="00.000.000/0000-00"
            />
          </div>
          <div className="space-y-2">
            <Label>Cor</Label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Cor ${c}`}
                  aria-pressed={color === c}
                  onClick={() => setColor(c)}
                  className={`swatch h-7 w-7 rounded-full ${color === c ? 'ring-2 ring-ring ring-offset-2 ring-offset-background' : ''}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          {!editing && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="useTemplate" defaultChecked className="mt-1" />
              <span>
                Começar com categorias de empresa
                <span className="block text-xs text-muted-foreground">
                  Vendas, Impostos (DAS/Simples), Fornecedores, Folha, Contabilidade e outras.
                </span>
              </span>
            </label>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {editing ? 'Salvar' : 'Cadastrar empresa'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
