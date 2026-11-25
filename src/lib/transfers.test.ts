import { describe, expect, it } from 'vitest';
import { TRANSFER_REASON_LABELS, transferView } from './transfers';

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
