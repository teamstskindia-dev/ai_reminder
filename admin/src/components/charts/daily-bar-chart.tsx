'use client';

import { format, parseISO } from 'date-fns';
import { Table2 } from 'lucide-react';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatNumber } from '@/lib/utils';

export interface DailySeries<K extends string> {
  key: K;
  label: string;
  /** CSS colour (use the --viz-* tokens). */
  color: string;
}

interface DailyBarChartProps<K extends string> {
  data: ({ date: string } & Record<K, number>)[];
  series: DailySeries<K>[];
  height?: number;
  /** Accessible summary of the chart. */
  summary: string;
}

function dayLabel(date: string, pattern = 'd MMM'): string {
  try {
    return format(parseISO(date), pattern);
  } catch {
    return date;
  }
}

function ChartTooltip<K extends string>({
  active,
  payload,
  label,
  series,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ dataKey?: unknown; value?: unknown }>;
  label?: unknown;
  series: DailySeries<K>[];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-36 rounded-lg border bg-popover px-3 py-2 text-popover-foreground shadow-md">
      <p className="mb-1.5 text-xs text-muted-foreground">{dayLabel(String(label), 'EEE d MMM yyyy')}</p>
      <ul className="space-y-1">
        {series.map((s) => {
          const entry = payload.find((p) => p.dataKey === s.key);
          return (
            <li key={s.key} className="flex items-center gap-2 text-xs">
              <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />
              <span className="font-semibold tabular-nums">{formatNumber(Number(entry?.value ?? 0))}</span>
              <span className="text-muted-foreground">{s.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Daily bars (stacked when there are several series) with tooltip, legend and a table view. */
export function DailyBarChart<K extends string>({ data, series, height = 240, summary }: DailyBarChartProps<K>) {
  const [showTable, setShowTable] = useState(false);
  const stacked = series.length > 1;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        {stacked ? (
          <ul className="flex flex-wrap items-center gap-4" aria-label="Legend">
            {series.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span aria-hidden className="size-2.5 rounded-sm" style={{ background: s.color }} />
                {s.label}
              </li>
            ))}
          </ul>
        ) : (
          <span />
        )}
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setShowTable((v) => !v)}
          aria-pressed={showTable}
          className="text-muted-foreground"
        >
          <Table2 /> {showTable ? 'Chart' : 'Table'}
        </Button>
      </div>
      {showTable ? (
        <div className="max-h-[240px] overflow-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                {series.map((s) => (
                  <TableHead key={s.key} className="text-right">
                    {s.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...data].reverse().map((row) => (
                <TableRow key={row.date}>
                  <TableCell>{dayLabel(row.date, 'EEE d MMM')}</TableCell>
                  {series.map((s) => (
                    <TableCell key={s.key} className="text-right tabular-nums">
                      {formatNumber(row[s.key])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <figure role="img" aria-label={summary} style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -12 }} barCategoryGap={2}>
              <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => dayLabel(d)}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
                tick={{ fontSize: 11, fill: 'var(--viz-axis)' }}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={44}
                tick={{ fontSize: 11, fill: 'var(--viz-axis)' }}
              />
              <Tooltip
                cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
                content={({ active, payload, label }) => (
                  <ChartTooltip active={active} payload={payload} label={label} series={series} />
                )}
              />
              {series.map((s, index) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  stackId={stacked ? 'stack' : undefined}
                  fill={s.color}
                  stroke="var(--card)"
                  strokeWidth={1}
                  radius={index === series.length - 1 ? [4, 4, 0, 0] : 0}
                  maxBarSize={28}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </figure>
      )}
    </div>
  );
}
