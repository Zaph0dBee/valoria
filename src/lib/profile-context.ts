import { cache } from 'react';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import type { FinancialProfile } from '@/types/database';
import { PROFILE_COOKIE, resolveProfileSelection, type ProfileSelection } from './profile-selection';

export type ProfileContext = {
  /** Todos os perfis do usuário (inclui arquivados, para rótulos), PF primeiro. */
  profiles: FinancialProfile[];
  /** Perfis que podem ser escolhidos e receber lançamentos. */
  activeProfiles: FinancialProfile[];
  active: ProfileSelection;
  /** null no modo Consolidado. */
  activeProfile: FinancialProfile | null;
  pf: FinancialProfile | null;
  showSelector: boolean;
};

/** Lê os perfis e o cookie de seleção. Cacheado por requisição. */
export const getProfileContext = cache(async (): Promise<ProfileContext> => {
  const supabase = await createClient();
  const [{ data }, cookieStore] = await Promise.all([
    supabase
      .from('financial_profiles')
      .select('*')
      .order('kind')
      .order('sort_order')
      .order('created_at'),
    cookies(),
  ]);

  const profiles = (data ?? []) as FinancialProfile[];
  const activeProfiles = profiles.filter((p) => !p.archived);
  const active = resolveProfileSelection(cookieStore.get(PROFILE_COOKIE)?.value, profiles);
  const activeProfile =
    active.mode === 'profile' ? (profiles.find((p) => p.id === active.profileId) ?? null) : null;

  return {
    profiles,
    activeProfiles,
    active,
    activeProfile,
    pf: profiles.find((p) => p.kind === 'pf') ?? null,
    showSelector: activeProfiles.length >= 2,
  };
});
