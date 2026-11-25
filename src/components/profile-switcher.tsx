'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ChevronsUpDown, Layers, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { setActiveProfile } from '@/actions/profiles';
import { CONSOLIDATED, profileLabel, type ProfileSelection } from '@/lib/profile-selection';
import type { FinancialProfile } from '@/types/database';

export type SwitcherProfile = Pick<FinancialProfile, 'id' | 'kind' | 'name' | 'color'>;

export function ProfileSwitcher({
  profiles,
  active,
  compact = false,
}: {
  profiles: SwitcherProfile[];
  active: ProfileSelection;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const current = active.mode === 'profile' ? profiles.find((p) => p.id === active.profileId) : null;
  const currentLabel = current ? profileLabel(current) : 'Consolidado';

  function choose(value: string) {
    startTransition(async () => {
      await setActiveProfile(value);
      router.refresh();
    });
  }

  const isActive = (value: string) =>
    value === CONSOLIDATED ? active.mode === 'consolidated' : active.mode === 'profile' && active.profileId === value;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Perfil: ${currentLabel}. Trocar perfil`}
          className={cn(
            'flex items-center gap-2 rounded-md border border-border/70 bg-card text-left transition-colors hover:bg-muted',
            compact ? 'h-9 px-2.5 text-xs max-w-[11rem]' : 'w-full px-3 py-2 text-sm',
            pending && 'opacity-60',
          )}
        >
          {current ? (
            <span className="swatch h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: current.color }} />
          ) : (
            <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 flex-1 truncate font-medium" data-testid="active-profile">
            {currentLabel}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>Ver finanças de</DropdownMenuLabel>
        {profiles.map((p) => (
          <DropdownMenuItem key={p.id} onSelect={() => choose(p.id)}>
            <span className="swatch h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="flex-1 truncate">{profileLabel(p)}</span>
            {isActive(p.id) && <Check className="h-3.5 w-3.5" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onSelect={() => choose(CONSOLIDATED)}>
          <Layers className="h-3.5 w-3.5" />
          <span className="flex-1">Consolidado</span>
          {isActive(CONSOLIDATED) && <Check className="h-3.5 w-3.5" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/empresas">
            <Building2 className="h-3.5 w-3.5" />
            Gerenciar empresas
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
