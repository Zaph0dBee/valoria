import { createClient } from '@/lib/supabase/server';
import { ImportClient } from './import-client';
import { formatDate } from '@/lib/format';
import { getProfileContext } from '@/lib/profile-context';
import { profileLabel } from '@/lib/profile-selection';

export default async function ImportarPage() {
  const supabase = await createClient();

  const profileCtx = await getProfileContext();
  const profileId = profileCtx.active.mode === 'profile' ? profileCtx.active.profileId : null;
  const profileName = (id: string) => {
    const p = profileCtx.profiles.find((x) => x.id === id);
    return p ? profileLabel(p) : '';
  };

  let importsQuery = supabase.from('imports').select('*').order('created_at', { ascending: false }).limit(10);
  if (profileId) importsQuery = importsQuery.eq('profile_id', profileId);

  const [catRes, importsRes] = await Promise.all([
    supabase.from('categories').select('id, profile_id, name, kind, color').eq('archived', false).order('sort_order'),
    importsQuery,
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-1">entrada em massa</p>
        <h1 className="font-display text-4xl tracking-tight">Importar</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Extrato do banco em CSV ou OFX. O Valoria reconhece as colunas mais comuns e você revisa antes de salvar.
        </p>
      </div>

      <ImportClient
        categories={catRes.data ?? []}
        profiles={profileCtx.activeProfiles.map(({ id, kind, name, color }) => ({ id, kind, name, color }))}
        defaultProfileId={profileId ?? (profileCtx.showSelector ? '' : (profileCtx.pf?.id ?? ''))}
        showProfileField={profileCtx.showSelector}
      />

      {importsRes.data && importsRes.data.length > 0 && (
        <div>
          <h2 className="font-display text-xl mb-3">Imports anteriores</h2>
          <ul className="divide-y border rounded-lg">
            {importsRes.data.map((imp) => (
              <li key={imp.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{imp.filename ?? '(sem nome)'}</p>
                  <p className="text-xs text-muted-foreground">
                    {profileCtx.showSelector && `${profileName(imp.profile_id)} · `}
                    {imp.source.toUpperCase()} · {formatDate(imp.created_at, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {imp.status === 'processed' && <span className="text-positive">{imp.transactions_count} lançamentos ✓</span>}
                  {imp.status === 'pending' && 'pendente'}
                  {imp.status === 'failed' && <span className="text-destructive">falhou</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
