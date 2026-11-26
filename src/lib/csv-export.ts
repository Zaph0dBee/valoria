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

const FORMULA_START = /^[=+\-@\t\r]/;

function field(value: string): string {
  return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Texto livre que o Excel leria como fórmula ("-PIX", "=SOMA") ganha um apóstrofo. */
function text(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value;
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
      text(r.profile),
      KIND_LABEL[r.kind],
      text(r.category ?? ''),
      text(r.subcategory ?? ''),
      text(r.description),
      brAmount(signed),
      text(r.counterpart ?? ''),
      r.reason ? TRANSFER_REASON_LABELS[r.reason] : '',
    ]
      .map(field)
      .join(';');
  });
  return '﻿' + [HEADER.join(';'), ...body].join('\r\n');
}
