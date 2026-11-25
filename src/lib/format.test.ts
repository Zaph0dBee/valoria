import { describe, expect, it } from 'vitest';
import { formatPercent } from './format';

describe('formatPercent', () => {
  it('usa vírgula decimal (pt-BR)', () => {
    expect(formatPercent(7.5, 1)).toBe('7,5%');
    expect(formatPercent(10, 1)).toBe('10,0%');
    expect(formatPercent(56.25)).toBe('56%');
  });

  it('trata valores inválidos como 0%', () => {
    expect(formatPercent(Number.NaN)).toBe('0%');
    expect(formatPercent(Number.POSITIVE_INFINITY)).toBe('0%');
  });
});
