'use client';

import * as React from 'react';

type Theme = 'light' | 'dark';

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = 'valoria-theme';

export function ThemeProvider({
  children,
  defaultTheme = 'dark',
}: {
  children: React.ReactNode;
  defaultTheme?: Theme;
  attribute?: string;
  enableSystem?: boolean;
}) {
  // Mantemos o primeiro render determinístico para SSR/hydration.
  // A preferência salva só é lida depois que o componente monta no navegador.
  const [theme, setThemeState] = React.useState<Theme>(defaultTheme);

  React.useEffect(() => {
    let savedTheme: Theme = defaultTheme;

    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') savedTheme = saved;
    } catch {
      // localStorage pode estar indisponível em alguns modos de privacidade.
    }

    document.documentElement.classList.toggle('dark', savedTheme === 'dark');
    document.documentElement.style.colorScheme = savedTheme;
    setThemeState(savedTheme);
  }, [defaultTheme]);

  const setTheme = React.useCallback((nextTheme: Theme) => {
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
    document.documentElement.style.colorScheme = nextTheme;

    try {
      window.localStorage.setItem(STORAGE_KEY, nextTheme);
    } catch {
      // A troca de tema continua funcionando mesmo sem persistência.
    }

    setThemeState(nextTheme);
  }, []);

  const value = React.useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = React.useContext(ThemeContext);
  if (!context) throw new Error('useTheme deve estar dentro de ThemeProvider');
  return context;
}
