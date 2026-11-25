import Papa from 'papaparse';
import type { ParsedRow } from '@/actions/imports';
import { parseMoney } from '@/lib/money';

// Reconhece colunas em português e inglês, formatos comuns de banco BR
const DATE_KEYS = ['data', 'date', 'dt', 'data_lancamento', 'data_movimento'];
const DESC_KEYS = ['descricao', 'descrição', 'description', 'historico', 'histórico', 'memo', 'estabelecimento'];
const AMOUNT_KEYS = ['valor', 'value', 'amount', 'montante'];
const DEBIT_KEYS = ['debito', 'débito', 'debit', 'saida', 'saída'];
const CREDIT_KEYS = ['credito', 'crédito', 'credit', 'entrada'];

function normalizeKey(k: string): string {
  return k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function findKey(row: Record<string, unknown>, candidates: string[]): string | null {
  const keys = Object.keys(row);
  for (const k of keys) {
    if (candidates.includes(normalizeKey(k))) return k;
  }
  return null;
}

function parseAmount(raw: unknown): number {
  return parseMoney(raw) ?? 0;
}

function parseDate(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  // dd/mm/yyyy
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  // yyyy-mm-dd
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // dd-mm-yyyy
  const dash = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dash) return `${dash[3]}-${dash[2]}-${dash[1]}`;
  // Tenta Date parser como último recurso
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseCSV(csvText: string): {
  rows: ParsedRow[];
  errors: string[];
} {
  const result = Papa.parse<Record<string, unknown>>(csvText, {
    header: true,
    skipEmptyLines: true,
    delimiter: '', // auto-detect
  });

  const errors: string[] = [];
  if (result.errors.length) {
    result.errors.slice(0, 3).forEach((e) => errors.push(e.message));
  }

  if (!result.data.length) {
    return { rows: [], errors: ['CSV vazio ou sem cabeçalho reconhecido'] };
  }

  const first = result.data[0];
  const dateKey = findKey(first, DATE_KEYS);
  const descKey = findKey(first, DESC_KEYS);
  const amountKey = findKey(first, AMOUNT_KEYS);
  const debitKey = findKey(first, DEBIT_KEYS);
  const creditKey = findKey(first, CREDIT_KEYS);

  if (!dateKey) {
    return {
      rows: [],
      errors: [`Coluna de data não encontrada. Esperando algo como: ${DATE_KEYS.join(', ')}`],
    };
  }
  if (!descKey) {
    return {
      rows: [],
      errors: [`Coluna de descrição não encontrada. Esperando: ${DESC_KEYS.join(', ')}`],
    };
  }
  if (!amountKey && !(debitKey && creditKey) && !debitKey && !creditKey) {
    return {
      rows: [],
      errors: [`Coluna de valor não encontrada. Esperando: ${AMOUNT_KEYS.join(', ')} ou colunas separadas de débito/crédito`],
    };
  }

  const rows: ParsedRow[] = [];
  for (const raw of result.data) {
    const date = parseDate(raw[dateKey]);
    const desc = String(raw[descKey] ?? '').trim();
    if (!date || !desc) continue;

    let amount = 0;
    let kind: ParsedRow['kind'] = 'despesa';

    if (amountKey) {
      const v = parseAmount(raw[amountKey]);
      amount = Math.abs(v);
      kind = v >= 0 ? 'receita' : 'despesa';
    } else {
      const debit = debitKey ? parseAmount(raw[debitKey]) : 0;
      const credit = creditKey ? parseAmount(raw[creditKey]) : 0;
      if (credit > 0) {
        amount = credit;
        kind = 'receita';
      } else if (debit > 0) {
        amount = debit;
        kind = 'despesa';
      }
    }

    if (amount === 0) continue;

    rows.push({
      occurred_on: date,
      amount,
      kind,
      description: desc.slice(0, 200),
    });
  }

  return { rows, errors };
}
