import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database';

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

export async function createClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();

  // @supabase/ssr 0.5.x foi instalado com uma versão mais nova do supabase-js.
  // O cast mantém a tipagem do banco correta sem alterar o comportamento em runtime.
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components não podem escrever cookies. O proxy mantém a sessão atualizada.
          }
        },
      },
    },
  ) as unknown as SupabaseClient<Database>;
}
