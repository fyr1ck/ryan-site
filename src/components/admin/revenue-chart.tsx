'use client'

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { formatPrice } from '@/lib/utils'

export interface RevenuePoint {
  /** Chave do dia (YYYY-MM-DD), só para o React reconciliar. */
  day: string
  /** Rótulo do eixo X, "05/09". */
  label: string
  /** Receita do dia em centavos. */
  cents: number
}

/** Eixo Y em formato curto: "R$ 1,2 mil" ocupa menos que "R$ 1.234,00". */
const compactBRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
})

const PRIMARY = 'hsl(var(--primary))'
const BORDER = 'hsl(var(--border))'
const MUTED = 'hsl(var(--muted-foreground))'

export function RevenueChart({ data }: { data: RevenuePoint[] }) {
  return (
    <div className="h-60 w-full sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="admin-revenue-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PRIMARY} stopOpacity={0.35} />
              <stop offset="100%" stopColor={PRIMARY} stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid vertical={false} stroke={BORDER} strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            minTickGap={24}
            interval="preserveStartEnd"
            tick={{ fontSize: 11, fill: MUTED }}
          />
          <YAxis
            width={68}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: MUTED }}
            tickFormatter={(value: unknown) => compactBRL.format(Number(value) / 100)}
          />
          <Tooltip
            cursor={{ stroke: BORDER, strokeWidth: 1 }}
            contentStyle={{
              background: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 'var(--radius)',
              fontSize: 12,
              padding: '0.5rem 0.75rem',
            }}
            labelStyle={{ color: MUTED, marginBottom: 2 }}
            itemStyle={{ color: 'hsl(var(--foreground))' }}
            formatter={(value: unknown) => [formatPrice(Number(value)), 'Receita'] as [string, string]}
          />
          <Area
            type="monotone"
            dataKey="cents"
            name="Receita"
            stroke={PRIMARY}
            strokeWidth={2}
            fill="url(#admin-revenue-fill)"
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
