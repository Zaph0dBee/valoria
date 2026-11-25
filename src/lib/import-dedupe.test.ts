import { describe, expect, it } from 'vitest';
import { splitDuplicates, type DedupeRow } from './import-dedupe';

const row = (over: Partial<DedupeRow> = {}): DedupeRow => ({
  occurred_on: '2026-11-05',
  amount: 345.67,
  kind: 'despesa',
  description: 'SUPERMERCADO EXEMPLO',
  ...over,
});

describe('splitDuplicates', () => {
  it('mantém tudo quando não há lançamentos existentes', () => {
    const rows = [row(), row({ amount: 10 })];
    expect(splitDuplicates(rows, [])).toEqual({ fresh: rows, duplicates: [] });
  });

  it('pula linha idêntica a um lançamento existente', () => {
    const r = row();
    const result = splitDuplicates([r, row({ amount: 99 })], [row()]);
    expect(result.duplicates).toEqual([r]);
    expect(result.fresh).toEqual([row({ amount: 99 })]);
  });

  it('ignora maiúsculas, acentos e espaços extras na descrição', () => {
    const result = splitDuplicates(
      [row({ description: '  Supermercado   Exemplo ' })],
      [row({ description: 'SUPERMERCADO EXEMPLO' })],
    );
    expect(result.fresh).toHaveLength(0);
    expect(
      splitDuplicates([row({ description: 'Farmácia' })], [row({ description: 'FARMACIA' })]).fresh,
    ).toHaveLength(0);
  });

  it('compara valores em centavos (sem erro de ponto flutuante)', () => {
    const result = splitDuplicates([row({ amount: 0.1 + 0.2 })], [row({ amount: 0.3 })]);
    expect(result.fresh).toHaveLength(0);
  });

  it('conta repetições: dois iguais no arquivo e um no banco → importa um', () => {
    const result = splitDuplicates([row(), row()], [row()]);
    expect(result.fresh).toHaveLength(1);
    expect(result.duplicates).toHaveLength(1);
  });

  it('não confunde data, tipo ou valor diferentes', () => {
    const existing = [row()];
    expect(splitDuplicates([row({ occurred_on: '2026-11-06' })], existing).fresh).toHaveLength(1);
    expect(splitDuplicates([row({ kind: 'receita' })], existing).fresh).toHaveLength(1);
    expect(splitDuplicates([row({ amount: 345.68 })], existing).fresh).toHaveLength(1);
  });

  it('aceita amount vindo do banco como string', () => {
    const existing = [{ ...row(), amount: '345.67' as unknown as number }];
    expect(splitDuplicates([row()], existing).fresh).toHaveLength(0);
  });
});
