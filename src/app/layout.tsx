import type { Metadata } from 'next';
import { Montserrat, Cormorant_Garamond, Caladea } from 'next/font/google';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/toaster';
import './globals.css';

export const dynamic = 'force-dynamic';

const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
  display: 'swap',
});

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  variable: '--font-cormorant',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

const caladea = Caladea({
  subsets: ['latin'],
  variable: '--font-caladea',
  display: 'swap',
  weight: ['400', '700'],
  style: ['normal', 'italic'],
});

export const metadata: Metadata = {
  title: 'Valoria — clareza que transforma. domínio que gera liberdade.',
  description:
    'Consultoria financeira que devolve o controle sobre suas próprias decisões. Aqui a gente organiza primeiro a cabeça, depois a planilha.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${montserrat.variable} ${cormorant.variable} ${caladea.variable}`}
    >
      <body className="min-h-screen font-sans">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <Toaster>{children}</Toaster>
        </ThemeProvider>
      </body>
    </html>
  );
}
