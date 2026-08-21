const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const BRL_COMPACT = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  compactDisplay: 'short',
});

export function formatMoney(value: number | null | undefined): string {
  return BRL.format(value ?? 0);
}

export function formatMoneyCompact(value: number | null | undefined): string {
  return BRL_COMPACT.format(value ?? 0);
}

export function formatDate(iso: string, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(iso).toLocaleDateString('pt-BR', opts);
}

export function formatMonthName(month: number, year?: number): string {
  const date = new Date(year ?? 2000, month - 1, 1);
  const name = date.toLocaleDateString('pt-BR', { month: 'long' });
  return year ? `${name.charAt(0).toUpperCase() + name.slice(1)} ${year}` : name;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function currentMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function monthRange(year: number, month: number): { start: string; end: string } {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}
