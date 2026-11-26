'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from '@/components/theme-provider';
import {
  LayoutDashboard,
  ArrowLeftRight,
  Tag,
  Target,
  Upload,
  Moon,
  Sun,
  LogOut,
  Building2,
  BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ValoriaLogo } from '@/components/brand/logo';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { createClient } from '@/lib/supabase/client';
import { ProfileSwitcher, type SwitcherProfile } from '@/components/profile-switcher';
import type { ProfileSelection } from '@/lib/profile-selection';

const items = [
  { href: '/dashboard', label: 'Painel', icon: LayoutDashboard },
  { href: '/transacoes', label: 'Lançamentos', icon: ArrowLeftRight },
  { href: '/categorias', label: 'Categorias', icon: Tag },
  { href: '/metas', label: 'Metas', icon: Target },
  { href: '/importar', label: 'Importar', icon: Upload },
];

// Só com 2+ perfis ativos: quem tem só a PF vê o app como antes.
const REPORTS_ITEM = { href: '/relatorios', label: 'Relatórios', icon: BarChart3 };

export function AppNav({
  userName,
  userEmail,
  profiles,
  activeProfile,
  showSelector,
}: {
  userName: string;
  userEmail: string;
  profiles: SwitcherProfile[];
  activeProfile: ProfileSelection;
  showSelector: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <>
      {/* Sidebar desktop */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-60 flex-col border-r border-border/60 bg-paper">
        <div className="h-20 flex items-center px-6 border-b border-border/60">
          <Link href="/dashboard">
            <ValoriaLogo className="h-6 text-primary" />
          </Link>
        </div>

        {showSelector && (
          <div className="px-3 pt-4">
            <ProfileSwitcher profiles={profiles} active={activeProfile} />
          </div>
        )}

        <nav className="flex-1 px-3 py-4 space-y-1">
          {(showSelector ? [...items, REPORTS_ITEM] : items).map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-border/60 space-y-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-3 text-muted-foreground"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            Tema {theme === 'dark' ? 'claro' : 'escuro'}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full text-left px-3 py-2 rounded-md hover:bg-muted flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                  {userName.slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{userName}</p>
                  <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top">
              <DropdownMenuLabel>Conta</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/empresas">
                  <Building2 className="h-4 w-4" />
                  Minhas empresas
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                <LogOut className="h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Header mobile */}
      <header className="md:hidden sticky top-0 z-40 bg-background/85 backdrop-blur border-b border-border/60">
        <div className="container flex h-14 items-center justify-between">
          <Link href="/dashboard">
            <ValoriaLogo className="h-5 text-primary" />
          </Link>
          <div className="flex items-center gap-1">
            {showSelector && <ProfileSwitcher profiles={profiles} active={activeProfile} compact />}
            <Button
              variant="ghost"
              size="icon"
              aria-label={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <div className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium">
                    {userName.slice(0, 1).toUpperCase()}
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{userName}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {showSelector && (
                  <DropdownMenuItem asChild>
                    <Link href="/relatorios">
                      <BarChart3 className="h-4 w-4" />
                      Relatórios
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <Link href="/empresas">
                    <Building2 className="h-4 w-4" />
                    Minhas empresas
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                  <LogOut className="h-4 w-4" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <nav className="container flex justify-between gap-0.5 pb-2">
          {items.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-md px-1.5 py-1.5 text-[11px] leading-none whitespace-nowrap transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
      </header>
    </>
  );
}
