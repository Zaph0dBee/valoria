import type { ProfileKind } from '@/types/database';

export const PROFILE_COOKIE = 'valoria_profile';
export const CONSOLIDATED = 'all';

export type ProfileSelection = { mode: 'profile'; profileId: string } | { mode: 'consolidated' };

type ProfileLike = { id: string; kind: ProfileKind; archived: boolean };

/**
 * Decide qual perfil mostrar a partir do cookie. Nunca falha: qualquer valor
 * inválido (empresa arquivada, de outro usuário, apagada) cai no PF.
 */
export function resolveProfileSelection(
  cookie: string | undefined,
  profiles: ProfileLike[],
): ProfileSelection {
  const active = profiles.filter((p) => !p.archived);
  const fallback = active.find((p) => p.kind === 'pf') ?? active[0];

  if (cookie === CONSOLIDATED && active.length >= 2) return { mode: 'consolidated' };

  const chosen = active.find((p) => p.id === cookie);
  if (chosen) return { mode: 'profile', profileId: chosen.id };

  return { mode: 'profile', profileId: fallback?.id ?? '' };
}

/** Rótulo de um perfil na interface: "Você (PF)" ou o nome da empresa. */
export function profileLabel(profile: { kind: ProfileKind; name: string }): string {
  return profile.kind === 'pf' ? 'Você (PF)' : profile.name;
}
