import { describe, expect, it } from 'vitest';
import { formatCnpj, isValidCnpj, normalizeDocument } from './cnpj';

describe('normalizeDocument', () => {
  it('mantém só os dígitos', () => {
    expect(normalizeDocument('11.222.333/0001-81')).toBe('11222333000181');
    expect(normalizeDocument('  ')).toBe('');
  });
});

describe('isValidCnpj', () => {
  it('aceita CNPJ com dígitos verificadores corretos', () => {
    expect(isValidCnpj('11222333000181')).toBe(true);
  });

  it.each([['11222333000182'], ['00000000000000'], ['1122233300018'], ['112223330001811'], ['abcdefghijklmn']])(
    'recusa %s',
    (value) => {
      expect(isValidCnpj(value)).toBe(false);
    },
  );
});

describe('formatCnpj', () => {
  it('formata 14 dígitos', () => {
    expect(formatCnpj('11222333000181')).toBe('11.222.333/0001-81');
  });

  it('devolve o valor original se não tiver 14 dígitos', () => {
    expect(formatCnpj('123')).toBe('123');
  });
});
