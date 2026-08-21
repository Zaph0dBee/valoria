import { cn } from '@/lib/utils';

/**
 * Símbolo Valoria — círculo + galho com folhas + estrela pequena.
 * Uso: <ValoriaMark className="h-8 w-8" />
 * Cor herda de currentColor — controlar via text-primary/text-accent.
 */
export function ValoriaMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      aria-hidden="true"
    >
      {/* Círculo — a mentoria, o ciclo completo */}
      <circle cx="32" cy="32" r="26" stroke="currentColor" strokeWidth="1.25" fill="none" />

      {/* Galho — trajetória, curvado */}
      <path
        d="M18 46 Q24 40 30 34 Q36 28 44 24"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        fill="none"
      />

      {/* Folha maior — direita */}
      <path
        d="M44 24 Q52 22 54 28 Q52 34 44 32 Q40 30 44 24 Z"
        fill="currentColor"
        opacity="0.85"
      />

      {/* Folha média — centro */}
      <path
        d="M34 30 Q42 26 44 32 Q42 38 34 36 Q30 34 34 30 Z"
        fill="currentColor"
        opacity="0.65"
      />

      {/* Folha menor — esquerda inferior */}
      <path
        d="M26 40 Q32 36 34 42 Q32 46 26 44 Q23 42 26 40 Z"
        fill="currentColor"
        opacity="0.5"
      />

      {/* Estrela pequena — canto superior esquerdo, discreta */}
      <path
        d="M18 20 L18.8 22 L21 22.2 L19.3 23.5 L19.9 25.5 L18 24.4 L16.1 25.5 L16.7 23.5 L15 22.2 L17.2 22 Z"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * Marca completa — símbolo + wordmark "VALORIA" ao lado.
 * Uso: <ValoriaLogo className="h-6" /> (defina altura, largura auto).
 */
export function ValoriaLogo({ className }: { className?: string }) {
  return (
    <div className={cn('inline-flex items-center gap-2.5', className)}>
      <ValoriaMark className="h-full aspect-square" />
      <span className="font-display text-2xl tracking-[0.15em] font-medium">
        VALORIA
      </span>
    </div>
  );
}
