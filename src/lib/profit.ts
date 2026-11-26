/** Arredonda em centavos sem o erro de ponto flutuante (100.005 → 100.01). */
export function roundCents(value: number): number {
  return Math.round(Number((value * 100).toPrecision(12))) / 100;
}

/**
 * Sugestão de distribuição de lucro da empresa no mês.
 * O resultado já desconta o pró-labore; o disponível tira o que já foi distribuído.
 * Resultado ≤ 0: mostra o valor e não sugere retirada.
 */
export function profitSuggestion(s: { resultado_operacional: number; lucros_distribuidos: number }): {
  resultado: number;
  distribuido: number;
  disponivel: number;
  sugerir: boolean;
} {
  const resultado = roundCents(Number(s.resultado_operacional ?? 0));
  const distribuido = roundCents(Number(s.lucros_distribuidos ?? 0));
  const disponivel = Math.max(roundCents(resultado - distribuido), 0);
  return { resultado, distribuido, disponivel, sugerir: resultado > 0 && disponivel > 0 };
}
