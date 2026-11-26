import { describe, expect, it } from 'vitest';
import { toTransactionsCsv, type CsvTransaction } from './csv-export';

const base: CsvTransaction = {
  occurred_on: '2026-01-05', profile: 'Você (PF)', kind: 'despesa', category: 'Mercado',
  subcategory: null, description: 'Compras', amount: 1234.56, counterpart: null, reason: null,
};
const lines = (csv: string) => csv.replace(/^﻿/, '').split('\r\n');

describe('toTransactionsCsv', () => {
  it('começa com BOM e cabeçalho exato', () => {
    const csv = toTransactionsCsv([]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(lines(csv)[0]).toBe('Data;Perfil;Tipo;Categoria;Subcategoria;Descrição;Valor;Destino;Motivo');
  });
  it('despesa sai negativa com vírgula e data pt-BR', () => {
    expect(lines(toTransactionsCsv([base]))[1]).toBe('05/01/2026;Você (PF);Despesa;Mercado;;Compras;-1234,56;;');
  });
  it('receita sai positiva', () => {
    expect(lines(toTransactionsCsv([{ ...base, kind: 'receita', category: 'Salário' }]))[1]).toBe(
      '05/01/2026;Você (PF);Receita;Salário;;Compras;1234,56;;',
    );
  });
  it('transferência mostra destino e motivo, negativa na origem', () => {
    const row: CsvTransaction = {
      ...base, profile: 'Loja', kind: 'transferencia', category: null, description: 'Pró-labore',
      amount: 3000, counterpart: 'Você (PF)', reason: 'pro_labore',
    };
    expect(lines(toTransactionsCsv([row]))[1]).toBe('05/01/2026;Loja;Transferência;;;Pró-labore;-3000,00;Você (PF);Pró-labore');
  });
  it('protege ; e aspas na descrição', () => {
    expect(lines(toTransactionsCsv([{ ...base, description: 'Mercado; "Extra"' }]))[1]).toContain(';"Mercado; ""Extra""";');
  });
  it('protege quebra de linha', () => {
    expect(toTransactionsCsv([{ ...base, description: 'a\nb' }])).toContain(';"a\nb";');
  });
  it('neutraliza texto que o Excel leria como fórmula, sem mexer no valor', () => {
    const line = lines(toTransactionsCsv([{ ...base, description: '-PIX ENVIADO', category: '=SOMA(1)' }]))[1];
    expect(line).toBe("05/01/2026;Você (PF);Despesa;'=SOMA(1);;'-PIX ENVIADO;-1234,56;;");
    expect(lines(toTransactionsCsv([{ ...base, description: '+Rendimento' }]))[1]).toContain(";'+Rendimento;");
    expect(lines(toTransactionsCsv([{ ...base, description: '@conta' }]))[1]).toContain(";'@conta;");
    expect(lines(toTransactionsCsv([{ ...base, description: '12x parcela' }]))[1]).toContain(';12x parcela;');
    expect(lines(toTransactionsCsv([{ ...base, description: '.net' }]))[1]).toContain(';.net;');
  });
});
