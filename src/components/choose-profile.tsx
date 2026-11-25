'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { setActiveProfile } from '@/actions/profiles';
import { profileLabel } from '@/lib/profile-selection';
import type { FinancialProfile } from '@/types/database';

/** Aviso usado no Consolidado em telas que só funcionam com um perfil escolhido. */
export function ChooseProfile({
  message,
  profiles,
}: {
  message: string;
  profiles: Pick<FinancialProfile, 'id' | 'kind' | 'name' | 'color'>[];
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  return (
    <Card className="border-dashed p-8 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {profiles.map((p) => (
          <Button
            key={p.id}
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await setActiveProfile(p.id);
                router.refresh();
              })
            }
          >
            <span className="swatch h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
            {profileLabel(p)}
          </Button>
        ))}
      </div>
    </Card>
  );
}
