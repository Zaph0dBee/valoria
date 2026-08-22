import { createClient } from '@/lib/supabase/server';
import { ReservesClient } from './reserves-client';

export default async function MetasPage() {
  const supabase = await createClient();

  const { data: reserves } = await supabase
    .from('reserves')
    .select('*')
    .eq('archived', false)
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-1">construção</p>
        <h1 className="font-display text-4xl tracking-tight">Metas & Patrimônio</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Defina objetivos e registre aportes. Quando um aporte é vinculado a uma meta, o progresso é atualizado automaticamente.
        </p>
      </div>

      <ReservesClient reserves={reserves ?? []} />
    </div>
  );
}
