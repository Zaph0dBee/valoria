'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Upload, FileText, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/toaster';
import { parseCSV } from '@/lib/csv-parser';
import { parseOFX } from '@/lib/ofx-parser';
import { decodeStatementText } from '@/lib/decode-text';
import { importTransactions, type ParsedRow } from '@/actions/imports';
import { formatDate, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ProfileKind, TransactionKind } from '@/types/database';
import { profileLabel } from '@/lib/profile-selection';
import { TRANSFER_REASON_LABELS } from '@/lib/transfers';
import type { TransferReason } from '@/types/database';

type Cat = { id: string; profile_id: string; name: string; kind: TransactionKind; color: string };
type ProfileOption = { id: string; kind: ProfileKind; name: string; color: string };

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 2000;

export function ImportClient({
  categories,
  profiles,
  defaultProfileId,
  showProfileField,
}: {
  categories: Cat[];
  profiles: ProfileOption[];
  /** Vazio no Consolidado: a pessoa precisa escolher. */
  defaultProfileId: string;
  showProfileField: boolean;
}) {
  const [profileId, setProfileId] = React.useState(defaultProfileId);
  const isCompany = profiles.find((p) => p.id === profileId)?.kind === 'pj';
  const profileCategories = categories.filter((c) => c.profile_id === profileId);
  const router = useRouter();
  const { toast } = useToast();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [filename, setFilename] = React.useState<string>('');
  const [source, setSource] = React.useState<'csv' | 'ofx'>('csv');
  const [rows, setRows] = React.useState<ParsedRow[]>([]);
  const [errors, setErrors] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      setRows([]);
      setErrors(['O arquivo ultrapassa 5 MB. Divida-o em arquivos menores.']);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setFilename(file.name);
    const text = decodeStatementText(await file.arrayBuffer());
    const isOFX = file.name.toLowerCase().endsWith('.ofx') || text.includes('<OFX>');
    const src = isOFX ? 'ofx' : 'csv';
    setSource(src);
    const parsed = isOFX ? parseOFX(text) : parseCSV(text);
    if (parsed.rows.length > MAX_IMPORT_ROWS) {
      setRows([]);
      setErrors([`O arquivo contém ${parsed.rows.length} lançamentos. O limite por importação é ${MAX_IMPORT_ROWS}.`]);
      return;
    }
    // Guarda o sinal original: define origem/destino se a linha virar transferência.
    setRows(parsed.rows.map((r) => ({ ...r, direction: r.kind === 'receita' ? 'in' : 'out' })));
    setErrors(parsed.errors);

    if (parsed.rows.length > 0) {
      toast({ title: `${parsed.rows.length} lançamentos reconhecidos` });
    }
  }

  function updateCategory(index: number, category_id: string | null) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, category_id } : r)));
  }

  function updateKind(index: number, kind: TransactionKind) {
    setRows((prev) =>
      prev.map((r, i) =>
        i === index
          ? {
              ...r,
              kind,
              category_id: null,
              transfer_profile_id: kind === 'transferencia' ? r.transfer_profile_id ?? null : null,
              transfer_reason: kind === 'transferencia' ? r.transfer_reason ?? null : null,
            }
          : r,
      ),
    );
  }

  function updateTransfer(index: number, patch: { transfer_profile_id?: string; transfer_reason?: TransferReason }) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  const otherProfiles = profiles.filter((p) => p.id !== profileId);

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    if (rows.length === 0) return;
    if (!profileId) {
      toast({ variant: 'destructive', title: 'Escolha de quem é este extrato' });
      return;
    }
    setLoading(true);
    const res = await importTransactions({ profile_id: profileId, source, filename, rows });
    setLoading(false);
    if (res.error) {
      toast({ variant: 'destructive', title: 'Erro no import', description: res.error });
      return;
    }
    const skipped = res.skipped ?? 0;
    if (res.count === 0 && skipped > 0) {
      toast({
        title: 'Nada novo para importar',
        description: `Os ${skipped} lançamentos deste arquivo já estavam registrados.`,
      });
    } else {
      toast({
        title: `${res.count} lançamentos importados`,
        description: skipped > 0 ? `${skipped} já existiam e foram ignorados.` : undefined,
      });
    }
    setRows([]);
    setFilename('');
    if (inputRef.current) inputRef.current.value = '';
    router.push('/dashboard');
  }

  function reset() {
    setRows([]);
    setFilename('');
    setErrors([]);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="space-y-4">
      {rows.length === 0 ? (
        <Card className="p-12 border-dashed">
          <div className="text-center">
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium mb-1">Arraste um arquivo aqui ou clique para escolher</p>
            <p className="text-sm text-muted-foreground mb-4">Aceita CSV (extrato tabular) e OFX (Open Financial Exchange)</p>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.ofx,text/csv,application/x-ofx"
              onChange={handleFile}
              className="hidden"
              id="file-input"
            />
            <Button asChild>
              <label htmlFor="file-input" className="cursor-pointer">
                <FileText className="h-4 w-4" />
                Escolher arquivo
              </label>
            </Button>

            {errors.length > 0 && (
              <div className="mt-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                {errors.map((err, i) => (
                  <p key={i}>{err}</p>
                ))}
              </div>
            )}
          </div>
        </Card>
      ) : (
        <>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">{filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {source.toUpperCase()} · {rows.length} lançamentos reconhecidos
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {showProfileField && (
                  <Select
                    value={profileId}
                    onValueChange={(value) => {
                      setProfileId(value);
                      const toCompany = profiles.find((p) => p.id === value)?.kind === 'pj';
                      setRows((prev) =>
                        prev.map((r) => ({
                          ...r,
                          category_id: null,
                          kind: toCompany && r.kind === 'reserva' ? 'despesa' : r.kind,
                        })),
                      );
                    }}
                  >
                    <SelectTrigger aria-label="De quem é este extrato?" className="h-9 w-48 text-sm">
                      <SelectValue placeholder="De quem é este extrato?" />
                    </SelectTrigger>
                    <SelectContent>
                      {profiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          <span className="inline-flex items-center gap-2">
                            <span className="swatch h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                            {profileLabel(p)}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button variant="ghost" onClick={reset}>
                  Cancelar
                </Button>
                <Button onClick={handleSave} disabled={loading}>
                  <Check className="h-4 w-4" />
                  {loading ? 'Salvando…' : `Importar ${rows.length}`}
                </Button>
              </div>
            </div>
          </Card>

          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[90px]">Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="w-[120px]">Tipo</TableHead>
                  <TableHead className="w-[200px]">Categoria</TableHead>
                  <TableHead className="text-right w-[120px]">Valor</TableHead>
                  <TableHead className="w-[40px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="num text-xs text-muted-foreground">
                      {formatDate(r.occurred_on, { day: '2-digit', month: '2-digit' })}
                    </TableCell>
                    <TableCell className="text-sm">{r.description}</TableCell>
                    <TableCell>
                      <Select value={r.kind} onValueChange={(v) => updateKind(i, v as TransactionKind)}>
                        <SelectTrigger className="h-8 text-xs" aria-label={`Tipo: ${r.description}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="receita">Receita</SelectItem>
                          <SelectItem value="despesa">Despesa</SelectItem>
                          {!isCompany && <SelectItem value="reserva">Aporte</SelectItem>}
                          {showProfileField && otherProfiles.length > 0 && (
                            <SelectItem value="transferencia">Transferência</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {r.kind === 'transferencia' ? (
                        <div className="flex flex-col gap-1">
                          <Select
                            value={r.transfer_profile_id ?? ''}
                            onValueChange={(v) => updateTransfer(i, { transfer_profile_id: v })}
                          >
                            <SelectTrigger className="h-8 text-xs" aria-label={`Outro perfil: ${r.description}`}>
                              <SelectValue placeholder={r.direction === 'in' ? 'Veio de…' : 'Foi para…'} />
                            </SelectTrigger>
                            <SelectContent>
                              {otherProfiles.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {profileLabel(p)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={r.transfer_reason ?? ''}
                            onValueChange={(v) => updateTransfer(i, { transfer_reason: v as TransferReason })}
                          >
                            <SelectTrigger className="h-8 text-xs" aria-label={`Motivo: ${r.description}`}>
                              <SelectValue placeholder="Motivo" />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(TRANSFER_REASON_LABELS) as TransferReason[]).map((reason) => (
                                <SelectItem key={reason} value={reason}>
                                  {reason === 'outro' ? 'Outro' : TRANSFER_REASON_LABELS[reason]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                      <Select
                        value={r.category_id ?? ''}
                        onValueChange={(v) => updateCategory(i, v || null)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          {profileCategories
                            .filter((c) => c.kind === r.kind)
                            .map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right num font-medium text-sm',
                        r.kind === 'receita' && 'text-positive',
                        r.kind === 'despesa' && 'text-destructive',
                        r.kind === 'reserva' && 'text-primary',
                        r.kind === 'transferencia' && (r.direction === 'in' ? 'text-positive' : 'text-destructive'),
                      )}
                    >
                      {r.kind === 'transferencia'
                        ? r.direction === 'in' ? '+' : '−'
                        : r.kind === 'despesa' || r.kind === 'reserva' ? '−' : '+'}
                      {formatMoney(r.amount)}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => removeRow(i)}
                        aria-label={`Remover ${r.description} da importação`}
                        title="Remover da importação"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
