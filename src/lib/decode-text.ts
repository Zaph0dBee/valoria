/**
 * Decodifica o conteúdo de um extrato. Muitos bancos brasileiros exportam
 * CSV/OFX em Windows-1252 (Latin-1); ler como UTF-8 estraga acentos e faz
 * cabeçalhos como "Descrição" não serem reconhecidos.
 */
export function decodeStatementText(bytes: ArrayBuffer | Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}
