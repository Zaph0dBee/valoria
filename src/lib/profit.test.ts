import { describe, expect, it } from 'vitest';
import { profitSuggestion } from './profit';

describe('profitSuggestion', () => {
  it('sugere todo o resultado quando nada foi distribuído', () => {
    expect(profitSuggestion({ resultado_operacional: 8400, lucros_distribuidos: 0 })).toEqual({
      resultado: 8400, distribuido: 0, disponivel: 8400, sugerir: true,
    });
  });
  it('desconta o lucro já distribuído', () => {
    expect(profitSuggestion({ resultado_operacional: 8400, lucros_distribuidos: 3000 }).disponivel).toBe(5400);
  });
  it('não sugere quando tudo já foi distribuído', () => {
    const s = profitSuggestion({ resultado_operacional: 8400, lucros_distribuidos: 8400 });
    expect(s.disponivel).toBe(0);
    expect(s.sugerir).toBe(false);
  });
  it('resultado negativo mostra o valor e não sugere', () => {
    const s = profitSuggestion({ resultado_operacional: -500, lucros_distribuidos: 0 });
    expect(s.resultado).toBe(-500);
    expect(s.disponivel).toBe(0);
    expect(s.sugerir).toBe(false);
  });
  it('resultado zero não sugere', () => {
    expect(profitSuggestion({ resultado_operacional: 0, lucros_distribuidos: 0 }).sugerir).toBe(false);
  });
  it('arredonda em centavos', () => {
    expect(profitSuggestion({ resultado_operacional: 100.005, lucros_distribuidos: 0 }).disponivel).toBe(100.01);
  });
});
