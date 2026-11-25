import { describe, expect, it } from 'vitest';
import { decodeStatementText } from './decode-text';

describe('decodeStatementText', () => {
  it('lê UTF-8', () => {
    const bytes = new TextEncoder().encode('Data;Descrição;Valor');
    expect(decodeStatementText(bytes)).toBe('Data;Descrição;Valor');
  });

  it('remove BOM do UTF-8', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('Data')]);
    expect(decodeStatementText(bytes)).toBe('Data');
  });

  it('cai para Windows-1252 quando o arquivo não é UTF-8 (extratos de bancos BR)', () => {
    // "Descrição" em Windows-1252: ç = 0xE7, ã = 0xE3
    const bytes = new Uint8Array([
      0x44, 0x65, 0x73, 0x63, 0x72, 0x69, 0xe7, 0xe3, 0x6f,
    ]);
    expect(decodeStatementText(bytes)).toBe('Descrição');
  });
});
