import { createClient } from '@/lib/supabase/server';
import { CategoriesClient } from './categories-client';

export default async function CategoriasPage() {
  const supabase = await createClient();

  const [catRes, subRes] = await Promise.all([
    supabase
      .from('categories')
      .select('id, name, kind, color, sort_order')
      .eq('archived', false)
      .order('kind')
      .order('sort_order'),
    supabase
      .from('subcategories')
      .select('id, category_id, name, sort_order')
      .eq('archived', false)
      .order('sort_order'),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-1">estrutura</p>
        <h1 className="font-display text-4xl tracking-tight">Categorias</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Organize seus lançamentos do jeito que faz sentido pra sua vida. Adicione, renomeie, apague.
        </p>
      </div>

      <CategoriesClient categories={catRes.data ?? []} subcategories={subRes.data ?? []} />
    </div>
  );
}
