import type { ParsedRow } from '@/actions/imports';

// Parser OFX simples — cobre o formato SGML padrão dos bancos brasileiros
export function parseOFX(ofxText: string): {
  rows: ParsedRow[];
  errors: string[];
} {
  const errors: string[] = [];
  const rows: ParsedRow[] = [];

  // Normaliza — remove header SGML se houver
  const bodyMatch = ofxText.match(/<OFX>[\s\S]*<\/OFX>/i);
  const body = bodyMatch ? bodyMatch[0] : ofxText;

  // Extrai todos os <STMTTRN>...</STMTTRN>
  const trnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  const trns = body.match(trnRegex);

  if (!trns || trns.length === 0) {
    return { rows: [], errors: ['Nenhuma transação encontrada no OFX'] };
  }

  for (const trn of trns) {
    const tag = (name: string) => {
      // OFX SGML permite tag sem fechamento — pega até <, quebra de linha ou fim
      const re = new RegExp(`<${name}>([^<\\r\\n]+)`, 'i');
      const m = trn.match(re);
      return m ? m[1].trim() : null;
    };

    const dt = tag('DTPOSTED');
    const amt = tag('TRNAMT');
    const memo = tag('MEMO') ?? tag('NAME') ?? '(sem descrição)';

    if (!dt || !amt) continue;

    // DTPOSTED = YYYYMMDD (às vezes com HHMMSS ou timezone)
    const dateMatch = dt.match(/^(\d{4})(\d{2})(\d{2})/);
    if (!dateMatch) continue;
    const occurred_on = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;

    const value = parseFloat(amt.replace(',', '.'));
    if (isNaN(value) || value === 0) continue;

    rows.push({
      occurred_on,
      amount: Math.abs(value),
      kind: value >= 0 ? 'receita' : 'despesa',
      description: memo.slice(0, 200),
    });
  }

  return { rows, errors };
}
