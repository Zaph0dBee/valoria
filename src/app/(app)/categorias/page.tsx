import { createClient } from '@/lib/supabase/server';
import { CategoriesClient } from './categories-client';

export default async function CategoriasPage() {
  const supabase = await createClient();

  const [catRes, subRes, reserveRes] = await Promise.all([
    supabase
      .from('categories')
      .select('id, name, kind, color, sort_order, group, planned_amount, recurrence, day_of_month, expense_nature, include_in_budget, planning_notes, default_reserve_id')
      .eq('archived', false)
      .order('kind')
      .order('sort_order'),
    supabase
      .from('subcategories')
      .select('id, category_id, name, sort_order, group_override, planned_amount, recurrence, day_of_month, expense_nature, include_in_budget, planning_notes, default_reserve_id')
      .eq('archived', false)
      .order('sort_order'),
    supabase
      .from('reserves')
      .select('id, name')
      .eq('archived', false)
      .order('name'),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-1">estrutura</p>
        <h1 className="font-display text-4xl tracking-tight">Categorias</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Organize sua estrutura e defina valores, recorrências e regras de planejamento. O realizado vem dos lançamentos.
        </p>
      </div>

      <CategoriesClient
        categories={catRes.data ?? []}
        subcategories={subRes.data ?? []}
        reserves={reserveRes.data ?? []}
      />
    </div>
  );
}
