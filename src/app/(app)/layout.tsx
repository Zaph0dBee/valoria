import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppNav } from '@/components/nav';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single();

  return (
    <div className="min-h-screen bg-background">
      <AppNav userName={profile?.full_name ?? user.email ?? 'você'} userEmail={user.email ?? ''} />
      <main className="md:pl-60">
        <div className="container max-w-6xl py-8 animate-fade-in">{children}</div>
      </main>
    </div>
  );
}
