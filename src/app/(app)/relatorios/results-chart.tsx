'use client';

import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTheme } from '@/components/theme-provider';
import { formatMoney, formatMoneyCompact } from '@/lib/format';

// Paleta categórica validada (dataviz) contra o fundo do card claro (#f7f0e8) e escuro (#1d1f20).
// A ordem é fixa e segue a ordem dos perfis (PF primeiro): a cor acompanha o perfil.
const SERIES_LIGHT = ['#257de0', '#f47230', '#00b894', '#f2a600', '#ee7fac', '#008a17', '#6a4ce2', '#ec4647'];
const SERIES_DARK = ['#338ced', '#e76624', '#00a888', '#d28e05', '#e24d8b', '#0aac23', '#9887ef', '#eb6263'];

export type ChartSeries = { id: string; label: string };
export type ChartPoint = { month: string; label: string } & Record<string, number | string>;

export function ResultsChart({ series, data }: { series: ChartSeries[]; data: ChartPoint[] }) {
  const { theme } = useTheme();
  const palette = theme === 'dark' ? SERIES_DARK : SERIES_LIGHT;
  const axis = theme === 'dark' ? '#9c9c9c' : '#6b6b6b';
  const grid = theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

  return (
    <div
      role="img"
      aria-label={`Resultado por perfil nos últimos 12 meses: ${series.map((s) => s.label).join(', ')}`}
      className="h-72 w-full"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: grid }} />
          <YAxis
            tick={{ fill: axis, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={72}
            tickFormatter={(v: number) => formatMoneyCompact(v)}
          />
          <ReferenceLine y={0} stroke={axis} strokeOpacity={0.5} />
          <Tooltip
            formatter={(value: number, name: string) => [formatMoney(value), name]}
            contentStyle={{ fontSize: 12, borderRadius: 6 }}
            cursor={{ stroke: axis, strokeOpacity: 0.4 }}
          />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s, i) => (
            <Line
              key={s.id}
              type="linear"
              dataKey={s.id}
              name={s.label}
              stroke={palette[i % palette.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
