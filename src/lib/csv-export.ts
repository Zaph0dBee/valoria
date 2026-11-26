import type { TransactionKind, TransferReason } from '@/types/database';
import { TRANSFER_REASON_LABELS } from '@/lib/transfers';

export type CsvTransaction = {
  occurred_on: string;
  profile: string;
  kind: TransactionKind;
  category: string | null;
  subcategory: string | null;
  description: string;
  amount: number;
  counterpart: string | null;
  reason: TransferReason | null;
};

const HEADER = ['Data', 'Perfil', 'Tipo', 'Categoria', 'Subcategoria', 'Descrição', 'Valor', 'Destino', 'Motivo'];

const KIND_LABEL: Record<TransactionKind, string> = {
  receita: 'Receita',
  despesa: 'Despesa',
  reserva: 'Aporte',
  transferencia: 'Transferência',
};

function field(value: string): string {
  return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function brDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function brAmount(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

/**
 * CSV que abre certo no Excel pt-BR: BOM UTF-8, ";" e vírgula decimal.
 * Valor com sinal na visão do perfil da linha (receita +; despesa, aporte e transferência −).
 */
export function toTransactionsCsv(rows: CsvTransaction[]): string {
  const body = rows.map((r) => {
    const signed = r.kind === 'receita' ? Number(r.amount) : -Number(r.amount);
    return [
      brDate(r.occurred_on),
      r.profile,
      KIND_LABEL[r.kind],
      r.category ?? '',
      r.subcategory ?? '',
      r.description,
      brAmount(signed),
      r.counterpart ?? '',
      r.reason ? TRANSFER_REASON_LABELS[r.reason] : '',
    ]
      .map(field)
      .join(';');
  });
  return '﻿' + [HEADER.join(';'), ...body].join('\r\n');
}
