import { describe, expect, it } from 'vitest';
import { comparisonLines } from './report-lines';

const zero = {
  total_receita: 0, total_despesa: 0, resultado_operacional: 0, total_aportes: 0, saldo_final: 0,
  transf_recebidas: 0, transf_enviadas: 0, entradas_transferidas: 0, pro_labore_pago: 0, lucros_distribuidos: 0,
};
const value = (r: Parameters<typeof comparisonLines>[0], label: string) =>
  comparisonLines(r).find((l) => l.label === label)?.value;

describe('comparisonLines', () => {
  it('na empresa, entradas − saídas − pró-labore = resultado', () => {
    const pj = { ...zero, total_receita: 10000, total_despesa: 2000, pro_labore_pago: 3000, resultado_operacional: 5000,
      transf_enviadas: 4000, lucros_distribuidos: 1000 };
    const l = comparisonLines(pj);
    const get = (label: string) => l.find((x) => x.label === label)!.value;
    expect(get('Entradas') - get('Saídas') - get('Pró-labore pago')).toBe(get('Resultado'));
    expect(get('Lucros distribuídos')).toBe(1000);
    expect(get('Outras transferências')).toBe(0);
  });
  it('na PF, pró-labore recebido fica em Entradas e não repete em transferências', () => {
    const pf = { ...zero, total_receita: 1000, entradas_transferidas: 3000, transf_recebidas: 3000, total_despesa: 500,
      resultado_operacional: 3500 };
    expect(value(pf, 'Entradas')).toBe(4000);
    expect(value(pf, 'Outras transferências')).toBe(0);
    expect(value(pf, 'Entradas')! - value(pf, 'Saídas')! - value(pf, 'Pró-labore pago')!).toBe(value(pf, 'Resultado'));
  });
  it('aporte de capital aparece como outra transferência', () => {
    expect(value({ ...zero, transf_enviadas: 2000 }, 'Outras transferências')).toBe(-2000);
    expect(value({ ...zero, transf_recebidas: 2000 }, 'Outras transferências')).toBe(2000);
  });
  it('sem linha vazia de transferências no consolidado', () => {
    expect(value(undefined, 'Resultado')).toBe(0);
  });
});
