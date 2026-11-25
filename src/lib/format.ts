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

function dateOnlyToLocalDate(value: string): Date {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
  }
  return new Date(value);
}

export function formatDate(iso: string, opts?: Intl.DateTimeFormatOptions): string {
  return dateOnlyToLocalDate(iso).toLocaleDateString('pt-BR', opts);
}

export function formatMonthName(month: number, year?: number): string {
  const date = new Date(year ?? 2000, month - 1, 1, 12, 0, 0);
  const name = date.toLocaleDateString('pt-BR', { month: 'long' });
  return year ? `${name.charAt(0).toUpperCase() + name.slice(1)} ${year}` : name;
}

function datePartsInTimeZone(timeZone = 'America/Sao_Paulo'): {
  year: number;
  month: number;
  day: number;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const get = (type: 'year' | 'month' | 'day') =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return { year: get('year'), month: get('month'), day: get('day') };
}

export function todayISO(timeZone = 'America/Sao_Paulo'): string {
  const { year, month, day } = datePartsInTimeZone(timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function currentMonth(timeZone = 'America/Sao_Paulo'): { year: number; month: number } {
  const { year, month } = datePartsInTimeZone(timeZone);
  return { year, month };
}

export function monthRange(year: number, month: number): { start: string; end: string } {
  const lastDay = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, '0');
  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

/** Percentual no padrão brasileiro: formatPercent(7.5, 1) → "7,5%". */
export function formatPercent(value: number, fractionDigits = 0): string {
  const n = Number.isFinite(value) ? value : 0;
  return `${n.toLocaleString('pt-BR', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}%`;
}
