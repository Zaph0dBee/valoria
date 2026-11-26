/** Mês no formato "AAAA-MM" deslocado em `delta` meses. */
export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const index = y * 12 + (m - 1) + delta;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function isMonth(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Quantidade de meses de `from` a `to`, inclusive (0 ou negativo se invertido). */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty * 12 + tm) - (fy * 12 + fm) + 1;
}

/** Último dia do mês "AAAA-MM" em "AAAA-MM-DD". */
export function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const day = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ym}-${String(day).padStart(2, '0')}`;
}
