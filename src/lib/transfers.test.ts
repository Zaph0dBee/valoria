import { describe, expect, it } from 'vitest';
import { TRANSFER_REASON_LABELS, matchExistingTransfers, resolveTransferRow, transferView } from './transfers';

const names = { pf: 'Você (PF)', loja: 'Loja' };
const proLabore = {
  profile_id: 'loja',
  counterpart_profile_id: 'pf',
  transfer_reason: 'pro_labore' as const,
  amount: 3000,
};

describe('transferView', () => {
  it('vista da empresa (origem): saída com destino', () => {
    expect(transferView(proLabore, 'loja', names)).toEqual({ sign: -1, label: 'Pró-labore → Você (PF)' });
  });

  it('vista da PF (destino): entrada com origem', () => {
    expect(transferView(proLabore, 'pf', names)).toEqual({ sign: 1, label: 'Pró-labore · Loja' });
  });

  it('consolidado: neutro, mostra origem e destino', () => {
    expect(transferView(proLabore, null, names)).toEqual({ sign: 0, label: 'Pró-labore: Loja → Você (PF)' });
  });

  it('aporte de capital visto da PF (origem)', () => {
    const aporte = { profile_id: 'pf', counterpart_profile_id: 'loja', transfer_reason: 'aporte_capital' as const, amount: 500 };
    expect(transferView(aporte, 'pf', names)).toEqual({ sign: -1, label: 'Aporte de capital → Loja' });
  });

  it('perfil desconhecido vira "outro perfil"', () => {
    expect(transferView(proLabore, 'pf', {})).toEqual({ sign: 1, label: 'Pró-labore · outro perfil' });
  });
});

describe('TRANSFER_REASON_LABELS', () => {
  it('tem os rótulos do spec', () => {
    expect(TRANSFER_REASON_LABELS).toEqual({
      pro_labore: 'Pró-labore',
      lucros: 'Lucros',
      aporte_capital: 'Aporte de capital',
      outro: 'Transferência',
    });
  });
});

describe('resolveTransferRow', () => {
  it('saída no extrato: origem é o perfil do import', () => {
    expect(resolveTransferRow({ direction: 'out', transfer_profile_id: 'pf' }, 'loja')).toEqual({
      profile_id: 'loja',
      counterpart_profile_id: 'pf',
    });
  });

  it('entrada no extrato: origem é o outro perfil', () => {
    expect(resolveTransferRow({ direction: 'in', transfer_profile_id: 'loja' }, 'pf')).toEqual({
      profile_id: 'loja',
      counterpart_profile_id: 'pf',
    });
  });
});

describe('matchExistingTransfers', () => {
  const t = (occurred_on: string, amount = 3000, profile_id = 'loja', counterpart_profile_id = 'pf') => ({
    occurred_on, amount, profile_id, counterpart_profile_id,
  });

  it('mesma transferência 2 dias depois no outro extrato → já registrada', () => {
    const row = t('2026-01-07');
    expect(matchExistingTransfers([row], [t('2026-01-05')])).toEqual({ fresh: [], already: [row] });
  });

  it('4 dias de diferença → nova', () => {
    const row = t('2026-01-09');
    expect(matchExistingTransfers([row], [t('2026-01-05')]).fresh).toEqual([row]);
  });

  it('valor diferente → nova', () => {
    expect(matchExistingTransfers([t('2026-01-05', 3000.01)], [t('2026-01-05')]).fresh).toHaveLength(1);
  });

  it('par invertido → nova', () => {
    expect(matchExistingTransfers([t('2026-01-05', 3000, 'pf', 'loja')], [t('2026-01-05')]).fresh).toHaveLength(1);
  });

  it('cada existente casa no máximo uma linha', () => {
    const result = matchExistingTransfers([t('2026-01-05'), t('2026-01-06')], [t('2026-01-05')]);
    expect(result.already).toHaveLength(1);
    expect(result.fresh).toHaveLength(1);
  });
});
