export type ReportSummary = {
  total_receita: number;
  total_despesa: number;
  resultado_operacional: number;
  total_aportes: number;
  saldo_final: number;
  transf_recebidas: number;
  transf_enviadas: number;
  entradas_transferidas: number;
  pro_labore_pago: number;
  lucros_distribuidos: number;
};

export type ReportLine = { label: string; value: number; strong?: boolean };

/**
 * Linhas do comparativo, montadas para a conta fechar em cada coluna:
 * Entradas − Saídas − Pró-labore pago = Resultado. Pró-labore e lucros recebidos
 * já estão em Entradas (PF); pró-labore e lucros pagos têm linha própria (empresa);
 * "Outras transferências" é só o que não aparece em nenhuma outra linha.
 */
export function comparisonLines(r: ReportSummary | undefined): ReportLine[] {
  const n = (v: number | undefined) => Number(v ?? 0);
  const proLabore = n(r?.pro_labore_pago);
  const lucros = n(r?.lucros_distribuidos);
  const otherIn = Math.max(n(r?.transf_recebidas) - n(r?.entradas_transferidas), 0);
  const otherOut = Math.max(n(r?.transf_enviadas) - proLabore - lucros, 0);
  return [
    { label: 'Entradas', value: n(r?.total_receita) + n(r?.entradas_transferidas) },
    { label: 'Saídas', value: n(r?.total_despesa) },
    { label: 'Pró-labore pago', value: proLabore },
    { label: 'Resultado', value: n(r?.resultado_operacional), strong: true },
    { label: 'Lucros distribuídos', value: lucros },
    { label: 'Aportes', value: n(r?.total_aportes) },
    { label: 'Outras transferências', value: otherIn - otherOut },
    { label: 'Saldo final', value: n(r?.saldo_final), strong: true },
  ];
}
