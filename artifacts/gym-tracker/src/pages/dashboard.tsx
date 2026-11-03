import { useState } from 'react';
import { Link } from 'wouter';
import { keepPreviousData } from '@tanstack/react-query';
import { useGetDashboard, getGetDashboardQueryKey } from '@workspace/api-client-react';
import type { DashboardData, GetDashboardParams } from '@workspace/api-client-react';
import { Plus, RotateCw, Undo2 } from 'lucide-react';
import { AccountGate, ErrorPanel, PageFrame, SkeletonBlock, errorMessage, errorStatus } from '@/components/session-shell';
import {
  CHART_PRIMARY, CHART_SECONDARY, ChartCard, DataTable, SeriesLine, VolumeArea, WeeklyChart, fmtLong, num, toUtc,
} from '@/components/dashboard-charts';

const selectCls = 'h-12 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-base font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary';

function Stat({ label, value, testid }: { label: string; value: number; testid: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-black tabular-nums md:text-5xl" data-testid={testid}>{value.toLocaleString()}</p>
    </div>
  );
}

function Board() {
  const [params, setParams] = useState<GetDashboardParams>({});
  const qp = params.exerciseId || params.workoutKey ? params : undefined;
  const q = useGetDashboard(qp, {
    query: { queryKey: getGetDashboardQueryKey(qp), refetchOnMount: 'always', placeholderData: keepPreviousData, retry: (n, e) => errorStatus(e) !== 404 && n < 2 },
  });
  const reset = () => setParams({});

  const refreshBtn = (
    <button type="button" onClick={() => q.refetch()} disabled={q.isFetching}
      className="inline-flex h-12 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-bold hover:border-primary/60 disabled:opacity-60" data-testid="button-refresh-dashboard">
      <RotateCw className={`h-4 w-4 ${q.isFetching ? 'animate-spin' : ''}`} /> {q.isFetching ? 'Refreshing' : 'Refresh'}
    </button>
  );

  if (q.isLoading) return <SkeletonBlock testid="status-dashboard-loading" rows={4} />;
  if (q.isError && !q.isPlaceholderData) {
    if (errorStatus(q.error) === 404 && qp) {
      return (
        <div className="rounded-3xl border border-destructive/40 bg-card p-6 md:p-8" role="alert" data-testid="status-dashboard-selection-missing">
          <h2 className="text-xl font-extrabold">That exercise or workout is no longer in your ledger.</h2>
          <p className="mt-2 text-muted-foreground">{errorMessage(q.error)} Go back to the default selection to keep reading your progress.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={reset} className="inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-5 font-bold text-primary-foreground" data-testid="button-reset-selection">
              <Undo2 className="h-4 w-4" /> Reset to defaults
            </button>
            {refreshBtn}
          </div>
        </div>
      );
    }
    return <ErrorPanel title="Your dashboard did not load." message={errorMessage(q.error)} onRetry={() => q.refetch()} retrying={q.isFetching} testid="status-dashboard-error" />;
  }
  const d = q.data as DashboardData;
  if (!d) return <SkeletonBlock testid="status-dashboard-loading" rows={4} />;
  const stale = q.isPlaceholderData;
  const selErr: unknown = q.error;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">All-time totals</p>
        {refreshBtn}
      </div>
      {selErr != null && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/40 bg-card p-4 text-sm" data-testid="status-dashboard-selection-missing">
          <span className="flex-1">That selection could not be loaded: {errorMessage(selErr)}</span>
          <button type="button" onClick={reset} className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 font-bold text-primary-foreground" data-testid="button-reset-selection"><Undo2 className="h-4 w-4" /> Reset to defaults</button>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2 md:gap-3" data-testid="section-totals">
        <Stat label="Sessions" value={d.totalSessions} testid="text-total-sessions" />
        <Stat label="Sets" value={d.totalSets} testid="text-total-sets" />
        <Stat label="Reps" value={d.totalReps} testid="text-total-reps" />
      </div>

      {d.totalSessions === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card/60 p-8 text-center md:p-12" data-testid="status-dashboard-empty">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">No history yet</p>
          <h2 className="mt-3 text-3xl font-black uppercase">Nothing to chart.</h2>
          <p className="mx-auto mt-2 max-w-sm text-muted-foreground">Progress lines appear once you log a session. Every chart here comes from what you actually lifted.</p>
          <Link href="/sessions/new" className="mt-6 inline-flex min-h-14 items-center gap-2 rounded-2xl bg-primary px-6 py-3 font-bold text-primary-foreground" data-testid="link-log-session-empty">
            <Plus className="h-5 w-5" /> Log a session
          </Link>
        </div>
      ) : (
        <Charts d={d} stale={stale} params={params} setParams={setParams} />
      )}
    </div>
  );
}

function Charts({ d, stale, params, setParams }: { d: DashboardData; stale: boolean; params: GetDashboardParams; setParams: (p: GetDashboardParams) => void }) {
  const first = d.weekly[0]?.weekStart, last = d.weekly[d.weekly.length - 1]?.weekStart;
  const exName = d.exercises.find((e) => e.id === d.selectedExerciseId)?.name;
  const woName = d.workouts.find((w) => w.key === d.selectedWorkoutKey)?.name;
  const exVal = String(params.exerciseId ?? d.selectedExerciseId ?? '');
  const woVal = params.workoutKey ?? d.selectedWorkoutKey ?? '';
  const weights = d.exerciseWeights.map((p) => ({ t: toUtc(p.date), v: p.weightLb, workoutName: p.workoutName, sessionId: p.sessionId, date: p.date, entryId: p.entryId }));
  const reps = d.exerciseReps.map((p) => ({ t: toUtc(p.date), v: p.totalReps, workoutName: p.workoutName, sessionId: p.sessionId, date: p.date }));
  const vol = d.workoutVolume.map((p) => ({ t: toUtc(p.date), v: p.volumeLbReps, workoutName: p.workoutName, sessionId: p.sessionId, date: p.date }));
  const dim = stale ? 'opacity-50 transition-opacity' : 'transition-opacity';

  return (
    <>
      <ChartCard testid="chart-weekly-sessions" eyebrow="Consistency" title="Sessions per week"
        caption={<span data-testid="text-weekly-range">Monday-start weeks, {first ? fmtLong(toUtc(first)) : ''} to {last ? fmtLong(toUtc(last)) : ''}, zero-filled.{d.weeklyWindowed && <strong className="text-foreground"> Showing only the latest 104 weeks; totals above still cover all time.</strong>}</span>}
        table={<DataTable testid="table-weekly" caption="Sessions per week" head={['Week of', 'Sessions']} rows={d.weekly.map((w) => [fmtLong(toUtc(w.weekStart)), w.sessionCount])} />}>
        <WeeklyChart weekly={d.weekly} />
      </ChartCard>

      <section className="space-y-4">
        <label className="block">
          <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">Exercise</span>
          <select className={`${selectCls} mt-2`} value={exVal} disabled={d.exercises.length === 0}
            onChange={(e) => setParams({ ...params, exerciseId: Number(e.target.value) || undefined })} data-testid="select-exercise">
            {d.exercises.length === 0 && <option value="">No exercises logged</option>}
            {d.exercises.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
        <div className={dim} aria-busy={stale}>
          {exName ? (
            <div className="space-y-4">
              <ChartCard testid="chart-exercise-weight" eyebrow="Load" title={`${exName}: weight (lb)`} caption="Every logged entry, including repeats on the same date."
                table={<DataTable testid="table-exercise-weight" caption={`${exName} weight per entry`} head={['Date', 'Workout', 'Weight (lb)']} rows={weights.map((p) => [fmtLong(p.t), p.workoutName, p.v])} />}>
                <SeriesLine data={weights} unit="lb" color={CHART_PRIMARY} />
              </ChartCard>
              <ChartCard testid="chart-exercise-reps" eyebrow="Work" title={`${exName}: total reps`} caption="Reps summed across all entries of this exercise within each session."
                table={<DataTable testid="table-exercise-reps" caption={`${exName} total reps per session`} head={['Date', 'Workout', 'Total reps']} rows={reps.map((p) => [fmtLong(p.t), p.workoutName, p.v])} />}>
                <SeriesLine data={reps} unit="reps" color={CHART_SECONDARY} />
              </ChartCard>
            </div>
          ) : <p className="rounded-2xl border border-dashed border-border p-5 text-muted-foreground" data-testid="status-exercise-empty">No exercise data to show.</p>}
        </div>
      </section>

      <section className="space-y-4">
        <label className="block">
          <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">Workout</span>
          <select className={`${selectCls} mt-2`} value={woVal} disabled={d.workouts.length === 0}
            onChange={(e) => setParams({ ...params, workoutKey: e.target.value || undefined })} data-testid="select-workout">
            {d.workouts.length === 0 && <option value="">No workouts logged</option>}
            {d.workouts.map((w) => <option key={w.key} value={w.key}>{w.name}</option>)}
          </select>
        </label>
        <div className={dim} aria-busy={stale}>
          {woName ? (
            <ChartCard testid="chart-workout-volume" eyebrow="Volume" title={`${woName}: volume`}
              caption={<span data-testid="text-volume-caveat">Volume = sum of weight × reps, in lb·reps. It is not a direct strength measure, and changing the exercises in a workout changes what is being compared.</span>}
              table={<DataTable testid="table-workout-volume" caption={`${woName} volume per session`} head={['Date', 'Logged as', 'Volume (lb·reps)']} rows={vol.map((p) => [fmtLong(p.t), p.workoutName, p.v])} />}>
              <VolumeArea data={vol} />
            </ChartCard>
          ) : <p className="rounded-2xl border border-dashed border-border p-5 text-muted-foreground" data-testid="status-workout-empty">No workout data to show.</p>}
        </div>
      </section>
      <p className="sr-only" aria-live="polite">{stale ? 'Loading selection' : `Showing ${exName ?? 'no exercise'} and ${woName ?? 'no workout'}; ${num(weights.length)} weight entries.`}</p>
    </>
  );
}

export default function DashboardPage() {
  return (
    <PageFrame>
      <p className="rise font-mono text-xs uppercase tracking-[0.3em] text-primary">Progress ledger</p>
      <h1 className="rise mt-3 text-5xl font-black uppercase leading-[0.9] md:text-7xl" style={{ animationDelay: '60ms' }}>Dashboard.</h1>
      <div className="mt-8"><AccountGate><Board /></AccountGate></div>
    </PageFrame>
  );
}
