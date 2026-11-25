import type { TransferReason } from '@/types/database';

export type { TransferReason };

export const TRANSFER_REASON_LABELS: Record<TransferReason, string> = {
  pro_labore: 'Pró-labore',
  lucros: 'Lucros',
  aporte_capital: 'Aporte de capital',
  outro: 'Transferência',
};

type TransferLike = {
  profile_id: string;
  counterpart_profile_id: string;
  transfer_reason: TransferReason;
  amount: number;
};

/**
 * Como uma transferência aparece numa visão:
 * - na origem: saída (sinal −1), "Pró-labore → Você (PF)";
 * - no destino: entrada (+1), "Pró-labore · Loja";
 * - no consolidado (null): neutra (0), "Pró-labore: Loja → Você (PF)".
 */
export function transferView(
  tx: TransferLike,
  viewProfileId: string | null,
  names: Record<string, string>,
): { sign: 1 | -1 | 0; label: string } {
  const reason = TRANSFER_REASON_LABELS[tx.transfer_reason];
  const from = names[tx.profile_id] ?? 'outro perfil';
  const to = names[tx.counterpart_profile_id] ?? 'outro perfil';

  if (viewProfileId === tx.profile_id) return { sign: -1, label: `${reason} → ${to}` };
  if (viewProfileId === tx.counterpart_profile_id) return { sign: 1, label: `${reason} · ${from}` };
  return { sign: 0, label: `${reason}: ${from} → ${to}` };
}

/**
 * Linha de extrato marcada como transferência → origem e destino.
 * Entrada no extrato ("in"): o dinheiro veio do outro perfil para o do import.
 * Saída ("out"): saiu do perfil do import para o outro.
 */
export function resolveTransferRow(
  row: { direction: 'in' | 'out'; transfer_profile_id: string },
  importProfileId: string,
): { profile_id: string; counterpart_profile_id: string } {
  return row.direction === 'in'
    ? { profile_id: row.transfer_profile_id, counterpart_profile_id: importProfileId }
    : { profile_id: importProfileId, counterpart_profile_id: row.transfer_profile_id };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayNumber(isoDate: string): number {
  return Math.round(Date.parse(`${isoDate}T12:00:00Z`) / DAY_MS);
}

/**
 * Separa transferências do import que já existem: mesmo par (origem, destino),
 * mesmo valor em centavos e data com até `toleranceDays` de diferença (o
 * débito na empresa e o crédito na PF costumam cair em dias diferentes).
 * Cada transferência existente casa com no máximo uma linha.
 */
export function matchExistingTransfers<
  T extends { occurred_on: string; amount: number; profile_id: string; counterpart_profile_id: string },
>(rows: T[], existing: T[], toleranceDays = 3): { fresh: T[]; already: T[] } {
  const pool = existing.map((e) => ({
    key: `${e.profile_id}|${e.counterpart_profile_id}|${Math.round(Number(e.amount) * 100)}`,
    day: dayNumber(e.occurred_on),
    used: false,
  }));
  const fresh: T[] = [];
  const already: T[] = [];
  for (const row of rows) {
    const key = `${row.profile_id}|${row.counterpart_profile_id}|${Math.round(Number(row.amount) * 100)}`;
    const day = dayNumber(row.occurred_on);
    const match = pool.find((e) => !e.used && e.key === key && Math.abs(e.day - day) <= toleranceDays);
    if (match) {
      match.used = true;
      already.push(row);
    } else {
      fresh.push(row);
    }
  }
  return { fresh, already };
}
