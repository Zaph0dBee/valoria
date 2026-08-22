/**
 * Faixas de Referência Valoria
 *
 * Diretriz filosófica: NÃO usamos "ideal" ou "correto". Usamos "faixa de
 * referência" — porque uma pessoa que ganha R$ 3 mil e uma que ganha R$ 30 mil
 * não devem receber a mesma régua rígida.
 *
 * O semáforo comunica sem julgar:
 *   🟢 dentro   — está na faixa observada em vidas financeiras saudáveis
 *   🟡 atenção  — está acima da faixa, vale observar (não é erro)
 *   🔴 alto     — bem acima da faixa, é onde geralmente há oportunidade
 *
 * Nunca dizer "você está gastando demais". Sempre "vale observar se esse
 * percentual está relacionado a X, Y, Z".
 */

import type { CategoryGroup } from '@/types/database';

export type SemaphoreLevel = 'ok' | 'atencao' | 'alto' | 'baixo' | 'neutro';

export interface ReferenceRange {
  /** Faixa mínima da referência Valoria (% da renda) */
  min: number;
  /** Faixa máxima da referência Valoria (% da renda) */
  max: number;
  /** Acima disso vira 🔴 alto */
  altoLimit: number;
  /** Se for grupo de investimento, valores baixos são o problema */
  baixoIsBad?: boolean;
}

/** Faixas Valoria por grupo NCE */
export const GROUP_REFERENCES: Record<CategoryGroup, ReferenceRange> = {
  necessidades: {
    min: 45,
    max: 55,
    altoLimit: 65,
  },
  construcao: {
    min: 15,
    max: 25,
    altoLimit: 100, // não tem limite superior — quanto mais, melhor
    baixoIsBad: true, // se estiver abaixo do mínimo, aí é atenção
  },
  estilo: {
    min: 10,
    max: 20,
    altoLimit: 30,
  },
  livre: {
    min: 5,
    max: 15,
    altoLimit: 25,
  },
};

/** Labels amigáveis dos grupos */
export const GROUP_LABELS: Record<CategoryGroup, string> = {
  necessidades: 'Necessidades',
  construcao: 'Construção',
  estilo: 'Estilo de vida',
  livre: 'Livre',
};

/** Descrições curtas — o que cada grupo significa */
export const GROUP_DESCRIPTIONS: Record<CategoryGroup, string> = {
  necessidades: 'Moradia, alimentação, transporte, saúde. O básico da vida.',
  construcao: 'Investimentos, reservas, quitação de dívidas. Seu futuro.',
  estilo: 'Restaurantes, roupas, lazer, viagens. Sua qualidade de vida.',
  livre: 'Gastos variáveis, pequenos, sem grande impacto de longo prazo.',
};

/** Cores dos grupos (usam as CSS variables da Valoria) */
export const GROUP_COLORS: Record<CategoryGroup, string> = {
  necessidades: 'hsl(var(--primary))',      // verde floresta
  construcao: 'hsl(var(--accent))',         // dourado
  estilo: 'hsl(var(--secondary))',          // verde sálvia
  livre: 'hsl(var(--muted-foreground))',    // cinza
};

/**
 * Calcula o semáforo para uma categoria/grupo baseado no percentual da renda.
 */
export function calcSemaphore(
  pctOfIncome: number,
  reference: ReferenceRange,
): SemaphoreLevel {
  if (pctOfIncome === 0) return 'neutro';

  if (reference.baixoIsBad && pctOfIncome < reference.min) {
    return 'atencao'; // pouco investimento = atenção
  }

  if (pctOfIncome <= reference.max) return 'ok';
  if (pctOfIncome <= reference.altoLimit) return 'atencao';
  return 'alto';
}

/** Cor tailwind pra pintar o semáforo */
export const SEMAPHORE_STYLES: Record<SemaphoreLevel, {
  bg: string;
  text: string;
  dot: string;
  label: string;
}> = {
  ok: {
    bg: 'bg-positive/15',
    text: 'text-positive',
    dot: 'bg-positive',
    label: 'Dentro da faixa',
  },
  atencao: {
    bg: 'bg-accent/20',
    text: 'text-accent',
    dot: 'bg-accent',
    label: 'Atenção',
  },
  alto: {
    bg: 'bg-destructive/15',
    text: 'text-destructive',
    dot: 'bg-destructive',
    label: 'Acima da faixa',
  },
  baixo: {
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    dot: 'bg-muted-foreground',
    label: 'Abaixo da referência',
  },
  neutro: {
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    dot: 'bg-muted-foreground',
    label: 'Sem dados',
  },
};

/**
 * Frase Valoria — sem julgamento, com convite à observação.
 * Cada categoria pode receber seu texto customizado; o default é genérico.
 */
export function referenceMessage(
  groupLabel: string,
  pct: number,
  reference: ReferenceRange,
  level: SemaphoreLevel,
): string {
  const pctStr = pct.toFixed(1).replace('.', ',');
  const faixaStr = `${reference.min}–${reference.max}%`;

  if (level === 'ok') {
    return `${groupLabel} representa ${pctStr}% da sua renda. Está dentro da faixa de referência Valoria (${faixaStr}).`;
  }
  if (level === 'atencao') {
    if (reference.baixoIsBad && pct < reference.min) {
      return `${groupLabel} representa ${pctStr}% da sua renda. A faixa de referência Valoria é ${faixaStr}. Vale observar oportunidades de aumentar aportes.`;
    }
    return `${groupLabel} representa ${pctStr}% da sua renda. A faixa de referência é ${faixaStr}. Vale observar onde esse percentual está sendo aplicado.`;
  }
  if (level === 'alto') {
    return `${groupLabel} representa ${pctStr}% da sua renda — acima da faixa de referência (${faixaStr}). Este é um bom ponto para observar de perto.`;
  }
  return `Sem dados suficientes para ${groupLabel} neste mês.`;
}
