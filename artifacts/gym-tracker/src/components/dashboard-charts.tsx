import { useState, type ReactNode } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { ChevronDown } from 'lucide-react';

export const CHART_PRIMARY = '#61A9BD';
export const CHART_SECONDARY = '#CED14E';
const DAY = 86_400_000;
const GRID = 'hsl(100 5% 22%)';
const TICK = { fill: 'hsl(90 6% 70%)', fontSize: 11, fontFamily: 'ui-monospace, monospace' };

export function toUtc(d: string): number {
  return Date.parse(`${d}T00:00:00Z`);
}
export function fmtShort(t: number) {
  return new Date(t).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric', year: '2-digit' });
}
export function fmtLong(t: number) {
  return new Date(t).toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
export const num = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

function domain(ts: number[], pad = DAY): [number, number] {
  if (ts.length === 0) return [0, 1];
  let min = Infinity, max = -Infinity;
  for (const t of ts) { min = Math.min(min, t); max = Math.max(max, t); }
  const p = Math.max(pad, (max - min) * 0.03);
  return [min - p, max + p];
}

function TipBox({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-xl">{children}</div>;
}

type TipProps = { active?: boolean; payload?: Array<{ payload: Record<string, unknown> }> };

export function ChartCard({ title, eyebrow, testid, children, table, caption }: { title: string; eyebrow: string; testid: string; children: ReactNode; table: ReactNode; caption?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rise rounded-3xl border border-border bg-card p-5 md:p-7" data-testid={testid}>
      <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-primary">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-black uppercase leading-tight">{title}</h2>
      {caption && <div className="mt-2 text-sm text-muted-foreground">{caption}</div>}
      <div className="mt-5 h-64 w-full" aria-hidden="true">{children}</div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-muted-foreground hover:text-foreground"
        data-testid={`button-toggle-table-${testid}`}>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} /> {open ? 'Hide data table' : 'Show data table'}
      </button>
      {open && <div className="mt-3 max-h-80 overflow-auto rounded-xl border border-border">{table}</div>}
    </section>
  );
}

export function DataTable({ caption, head, rows, testid }: { caption: string; head: string[]; rows: (string | number)[][]; testid: string }) {
  return (
    <table className="w-full text-left text-sm" data-testid={testid}>
      <caption className="sr-only">{caption}</caption>
      <thead className="sticky top-0 bg-card font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        <tr>{head.map((h) => <th key={h} scope="col" className="px-3 py-2">{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-border">
            {r.map((c, j) => <td key={j} className={`px-3 py-2 ${typeof c === 'number' ? 'font-mono tabular-nums' : ''}`}>{typeof c === 'number' ? num(c) : c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const xAxis = (ts: number[], pad?: number) => (
  <XAxis type="number" dataKey="t" scale="time" domain={domain(ts, pad)} tickFormatter={fmtShort} tick={TICK} stroke={GRID} minTickGap={24} allowDuplicatedCategory />
);

export function WeeklyChart({ weekly }: { weekly: { weekStart: string; sessionCount: number }[] }) {
  const data = weekly.map((w) => ({ t: toUtc(w.weekStart), v: w.sessionCount }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        {xAxis(data.map((d) => d.t), 4 * DAY)}
        <YAxis domain={[0, 'auto']} allowDecimals={false} tick={TICK} stroke={GRID} width={40} label={{ value: 'sessions', angle: -90, position: 'insideLeft', fill: TICK.fill, fontSize: 11, dx: 14 }} />
        <Tooltip cursor={{ fill: 'hsl(75 90% 57% / 0.06)' }} content={({ active, payload }: TipProps) => {
          if (!active || !payload?.length) return null;
          const p = payload[0].payload as { t: number; v: number };
          return <TipBox><p className="font-bold">Week of {fmtLong(p.t)}</p><p className="mt-1 font-mono">{p.v} {p.v === 1 ? 'session' : 'sessions'}</p></TipBox>;
        }} />
        <Bar dataKey="v" fill={CHART_PRIMARY} radius={[3, 3, 0, 0]} maxBarSize={18} minPointSize={0} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

type Pt = { t: number; v: number; workoutName: string; sessionId: number };

export function SeriesLine({ data, unit, color }: { data: Pt[]; unit: string; color: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        {xAxis(data.map((d) => d.t))}
        <YAxis domain={[0, 'auto']} tick={TICK} stroke={GRID} width={48} tickFormatter={(v: number) => num(v)} label={{ value: unit, angle: -90, position: 'insideLeft', fill: TICK.fill, fontSize: 11, dx: 14 }} />
        <Tooltip content={({ active, payload }: TipProps) => {
          if (!active || !payload?.length) return null;
          const p = payload[0].payload as Pt;
          return <TipBox><p className="font-bold">{fmtLong(p.t)}</p><p className="text-muted-foreground">{p.workoutName} (session #{p.sessionId})</p><p className="mt-1 font-mono">{num(p.v)} {unit}</p></TipBox>;
        }} />
        <Line type="linear" dataKey="v" stroke={color} strokeWidth={2.5} dot={{ r: 4, fill: color, strokeWidth: 0 }} activeDot={{ r: 6 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function VolumeArea({ data }: { data: Pt[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        {xAxis(data.map((d) => d.t))}
        <YAxis domain={[0, 'auto']} tick={TICK} stroke={GRID} width={56} tickFormatter={(v: number) => Intl.NumberFormat(undefined, { notation: 'compact' }).format(v)} label={{ value: 'lb·reps', angle: -90, position: 'insideLeft', fill: TICK.fill, fontSize: 11, dx: 10 }} />
        <Tooltip content={({ active, payload }: TipProps) => {
          if (!active || !payload?.length) return null;
          const p = payload[0].payload as Pt;
          return <TipBox><p className="font-bold">{fmtLong(p.t)}</p><p className="text-muted-foreground">{p.workoutName} (session #{p.sessionId})</p><p className="mt-1 font-mono">{num(p.v)} lb·reps</p></TipBox>;
        }} />
        <Area type="linear" dataKey="v" baseValue={0} stroke={CHART_PRIMARY} fill={CHART_PRIMARY} fillOpacity={0.22} strokeWidth={2.5} dot={{ r: 4, fill: CHART_PRIMARY, strokeWidth: 0 }} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
