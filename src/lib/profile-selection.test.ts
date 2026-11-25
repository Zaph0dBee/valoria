import { describe, expect, it } from 'vitest';
import { resolveProfileSelection } from './profile-selection';

const pf = { id: 'pf-1', kind: 'pf' as const, archived: false };
const pj = { id: 'pj-1', kind: 'pj' as const, archived: false };
const pjArquivada = { id: 'pj-2', kind: 'pj' as const, archived: true };

describe('resolveProfileSelection', () => {
  it('sem cookie → PF', () => {
    expect(resolveProfileSelection(undefined, [pf, pj])).toEqual({ mode: 'profile', profileId: 'pf-1' });
  });

  it('"all" com só o PF ativo → PF', () => {
    expect(resolveProfileSelection('all', [pf, pjArquivada])).toEqual({ mode: 'profile', profileId: 'pf-1' });
  });

  it('"all" com 2+ perfis ativos → consolidado', () => {
    expect(resolveProfileSelection('all', [pf, pj])).toEqual({ mode: 'consolidated' });
  });

  it('id de empresa ativa → essa empresa', () => {
    expect(resolveProfileSelection('pj-1', [pf, pj])).toEqual({ mode: 'profile', profileId: 'pj-1' });
  });

  it('id de empresa arquivada → PF', () => {
    expect(resolveProfileSelection('pj-2', [pf, pj, pjArquivada])).toEqual({ mode: 'profile', profileId: 'pf-1' });
  });

  it('id desconhecido (ex.: de outro usuário) → PF', () => {
    expect(resolveProfileSelection('outro', [pf, pj])).toEqual({ mode: 'profile', profileId: 'pf-1' });
  });

  it('lista sem PF (estado inesperado) → primeiro perfil ativo', () => {
    expect(resolveProfileSelection(undefined, [pj])).toEqual({ mode: 'profile', profileId: 'pj-1' });
  });
});
