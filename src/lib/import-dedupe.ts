import type { TransactionKind } from '@/types/database';

export type DedupeRow = {
  occurred_on: string;
  amount: number;
  kind: TransactionKind;
  description: string;
};

function normalizeDescription(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function keyOf(row: DedupeRow): string {
  const cents = Math.round(Number(row.amount) * 100);
  return [row.occurred_on, row.kind, cents, normalizeDescription(row.description)].join('|');
}

/**
 * Separa as linhas de uma importação entre novas e já existentes no banco.
 * Conta repetições: cada lançamento existente "consome" no máximo uma linha
 * igual do arquivo, então duas compras idênticas legítimas no mesmo dia não
 * se perdem se só uma delas já tinha sido importada.
 */
export function splitDuplicates<T extends DedupeRow>(
  rows: T[],
  existing: DedupeRow[],
): { fresh: T[]; duplicates: T[] } {
  const available = new Map<string, number>();
  for (const e of existing) {
    const k = keyOf(e);
    available.set(k, (available.get(k) ?? 0) + 1);
  }

  const fresh: T[] = [];
  const duplicates: T[] = [];
  for (const r of rows) {
    const k = keyOf(r);
    const left = available.get(k) ?? 0;
    if (left > 0) {
      available.set(k, left - 1);
      duplicates.push(r);
    } else {
      fresh.push(r);
    }
  }
  return { fresh, duplicates };
}
