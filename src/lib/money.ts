/**
 * Converte um valor monetário digitado (ou vindo de extrato) em número.
 *
 * Entende os formatos brasileiro ("5.000,00", "1.500", "12,5") e americano
 * ("1,234.56"), com ou sem "R$" e sinal negativo. Retorna null quando o texto
 * está vazio ou não é um valor válido — nunca chuta.
 *
 * Regras para separadores:
 * - Vírgula e ponto juntos: o que vier por último é o decimal.
 * - Só vírgulas: uma vírgula é decimal ("12,5"); várias, em grupos de 3, são milhar.
 * - Só pontos: vários pontos, ou um ponto seguido de exatamente 3 dígitos, são
 *   milhar ("1.500" = mil e quinhentos); caso contrário é decimal ("10.5").
 */
export function parseMoney(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;

  let s = String(raw).replace(/\s+/g, '');
  let negative = false;
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  s = s.replace(/^R\$/i, '');
  if (s.startsWith('-')) {
    if (negative) return null;
    negative = true;
    s = s.slice(1);
  }

  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let intPart: string;
  let decPart = '';

  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const thousandSep = decimalSep === ',' ? '.' : ',';
    const [int, dec, ...rest] = s.split(decimalSep);
    if (rest.length > 0) return null;
    if (!isThousandsGrouped(int, thousandSep)) return null;
    intPart = int.split(thousandSep).join('');
    decPart = dec;
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? ',' : '.';
    const groups = s.split(sep);
    const looksLikeThousands =
      groups.length > 2 || (sep === '.' && groups[1].length === 3);
    if (looksLikeThousands) {
      if (!isThousandsGrouped(s, sep)) return null;
      intPart = groups.join('');
    } else {
      [intPart, decPart] = groups;
    }
  } else {
    intPart = s;
  }

  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(decPart)) return null;
  if (!intPart && !decPart) return null;

  const value = Number(`${intPart || '0'}.${decPart || '0'}`);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

/** "1.234.567" com sep "." → true; "1.23.4" → false. */
function isThousandsGrouped(value: string, sep: string): boolean {
  const groups = value.split(sep);
  if (groups.length === 1) return /^\d+$/.test(value);
  const [first, ...rest] = groups;
  return /^\d{1,3}$/.test(first) && rest.every((g) => /^\d{3}$/.test(g));
}
