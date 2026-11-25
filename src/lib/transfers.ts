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
