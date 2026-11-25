import { describe, expect, it } from 'vitest';
import { formatMoneyInput, parseMoney } from './money';

describe('parseMoney', () => {
  it.each([
    // formato brasileiro
    ['5.000,00', 5000],
    ['1.234,56', 1234.56],
    ['1.234.567,89', 1234567.89],
    ['1234,56', 1234.56],
    ['0,5', 0.5],
    ['12,3', 12.3],
    // ponto como milhar sem centavos (pt-BR): "1.500" é mil e quinhentos
    ['1.500', 1500],
    ['1.000.000', 1000000],
    // ponto como decimal (digitado ou valor vindo do banco)
    ['10.5', 10.5],
    ['10.50', 10.5],
    ['1234.56', 1234.56],
    // formato americano
    ['1,234.56', 1234.56],
    ['1,234,567.89', 1234567.89],
    // inteiros, símbolo e espaços
    ['5000', 5000],
    ['R$ 5.000,00', 5000],
    ['R$5.000,00', 5000],
    ['  42  ', 42],
    // negativos
    ['-1.234,56', -1234.56],
    ['R$ -50,00', -50],
    ['-R$ 50,00', -50],
  ])('converte %j em %d', (input, expected) => {
    expect(parseMoney(input)).toBeCloseTo(expected, 10);
  });

  it.each([[''], ['   '], ['abc'], ['1,2,3,4'], ['12a'], ['1.2.3,4.5'], [',,'], ['-']])(
    'retorna null para %j',
    (input) => {
      expect(parseMoney(input)).toBeNull();
    },
  );

  it('aceita number e devolve o próprio valor', () => {
    expect(parseMoney(12.5)).toBe(12.5);
  });

  it('retorna null para null, undefined e NaN', () => {
    expect(parseMoney(null)).toBeNull();
    expect(parseMoney(undefined)).toBeNull();
    expect(parseMoney(Number.NaN)).toBeNull();
  });
});

describe('formatMoneyInput', () => {
  it('formata no padrão brasileiro para preencher formulários', () => {
    expect(formatMoneyInput(345.67)).toBe('345,67');
    expect(formatMoneyInput(1500)).toBe('1.500,00');
    expect(formatMoneyInput('1234.5')).toBe('1.234,50');
  });

  it('o resultado volta ao mesmo número com parseMoney', () => {
    for (const v of [0.01, 12.3, 1500, 1234567.89]) {
      expect(parseMoney(formatMoneyInput(v))).toBeCloseTo(v, 10);
    }
  });

  it('retorna vazio para null/undefined', () => {
    expect(formatMoneyInput(null)).toBe('');
    expect(formatMoneyInput(undefined)).toBe('');
  });
});
