/** Mantém só os dígitos de um CPF/CNPJ digitado com ou sem máscara. */
export function normalizeDocument(value: string): string {
  return value.replace(/\D/g, '');
}

function checkDigit(digits: string, weights: number[]): number {
  const sum = weights.reduce((acc, weight, i) => acc + Number(digits[i]) * weight, 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

/** CNPJ com 14 dígitos e dígitos verificadores válidos. */
export function isValidCnpj(digits: string): boolean {
  if (!/^\d{14}$/.test(digits)) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;
  const first = checkDigit(digits, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checkDigit(digits, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return first === Number(digits[12]) && second === Number(digits[13]);
}

/** "11222333000181" → "11.222.333/0001-81". */
export function formatCnpj(digits: string): string {
  const m = digits.match(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/);
  return m ? `${m[1]}.${m[2]}.${m[3]}/${m[4]}-${m[5]}` : digits;
}
