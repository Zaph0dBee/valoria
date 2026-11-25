import { getProfileContext } from '@/lib/profile-context';
import { CompaniesClient } from './companies-client';

export default async function EmpresasPage() {
  const { profiles } = await getProfileContext();
  const companies = profiles.filter((p) => p.kind === 'pj');

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-1">pessoa jurídica</p>
        <h1 className="font-display text-4xl tracking-tight">Minhas empresas</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Cadastre suas empresas para ver as finanças da PF e da PJ separadas — e juntas no Consolidado.
        </p>
      </div>

      <CompaniesClient companies={companies} />
    </div>
  );
}
