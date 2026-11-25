import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppNav } from '@/components/nav';
import { getProfileContext } from '@/lib/profile-context';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single();

  const profileContext = await getProfileContext();

  return (
    <div className="min-h-screen bg-background">
      <AppNav
        userName={profile?.full_name ?? user.email ?? 'você'}
        userEmail={user.email ?? ''}
        profiles={profileContext.activeProfiles.map(({ id, kind, name, color }) => ({ id, kind, name, color }))}
        activeProfile={profileContext.active}
        showSelector={profileContext.showSelector}
      />
      <main className="md:pl-60">
        <div className="container max-w-6xl py-8 animate-fade-in">{children}</div>
      </main>
    </div>
  );
}
