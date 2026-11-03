import { useState } from 'react';
import { Link } from 'wouter';
import { ChevronRight, Plus } from 'lucide-react';
import { useListWorkouts, getListWorkoutsQueryKey } from '@workspace/api-client-react';
import { AccountGate, ErrorPanel, PageFrame, SkeletonBlock, errorMessage } from '@/components/session-shell';

function WorkoutList({ includeArchived }: { includeArchived: boolean }) {
  const params = { includeArchived: includeArchived ? 'true' as const : 'false' as const };
  const q = useListWorkouts(params, { query: { queryKey: getListWorkoutsQueryKey(params), refetchOnMount: 'always', refetchOnWindowFocus: false } });
  if (q.isLoading) return <SkeletonBlock testid="status-workouts-loading" rows={3} />;
  if (q.isError) return <ErrorPanel title="Workouts did not load." message={errorMessage(q.error)} onRetry={() => q.refetch()} retrying={q.isFetching} testid="status-workouts-error" />;
  const list = q.data ?? [];
  if (!list.length) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-card/60 p-8 md:p-10" data-testid="status-workouts-empty">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">Empty rack</p>
        <h2 className="mt-3 text-3xl font-black uppercase">No saved workouts{includeArchived ? '' : ' yet'}.</h2>
        <p className="mt-2 max-w-md text-muted-foreground">Write down a routine once, then start sessions from it whenever you train.</p>
        <Link href="/workouts/new" className="mt-6 inline-flex h-14 items-center gap-2 rounded-2xl bg-primary px-6 font-bold text-primary-foreground" data-testid="link-new-workout-empty"><Plus className="h-5 w-5" /> Build a workout</Link>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-card" data-testid="list-workouts">
      {list.map((w) => (
        <li key={w.id}>
          <Link href={`/workouts/${w.id}`} className="group flex items-center gap-4 px-5 py-5 transition-colors hover:bg-secondary/60" data-testid={`card-workout-${w.id}`}>
            <span className={`h-10 w-1.5 shrink-0 rounded-full ${w.archived ? 'bg-muted' : 'bg-primary'}`} />
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-lg font-extrabold ${w.archived ? 'text-muted-foreground' : ''}`} data-testid={`text-workout-name-${w.id}`}>{w.name}</span>
              <span className="mt-1 flex flex-wrap gap-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                <span data-testid={`text-workout-version-${w.id}`}>{w.latestVersionNumber ? `v${w.latestVersionNumber}` : 'No versions'}</span>
                {w.archived && <span className="rounded border border-border px-1.5" data-testid={`status-workout-archived-${w.id}`}>Archived</span>}
              </span>
            </span>
            <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function WorkoutsPage() {
  const [includeArchived, setIncludeArchived] = useState(false);
  return (
    <PageFrame>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="rise font-mono text-xs uppercase tracking-[0.3em] text-primary">Routines</p>
          <h1 className="rise mt-3 text-5xl font-black uppercase leading-[0.9] md:text-7xl" style={{ animationDelay: '60ms' }}>Workouts.</h1>
        </div>
        <Link href="/workouts/new" className="rise inline-flex h-14 items-center gap-2 rounded-2xl bg-primary px-6 font-bold text-primary-foreground active:scale-[0.98]" data-testid="link-new-workout">
          <Plus className="h-5 w-5" /> New workout
        </Link>
      </div>
      <label className="mt-8 inline-flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border bg-card px-4 text-sm font-semibold">
        <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} className="h-5 w-5 accent-[hsl(75_90%_57%)]" data-testid="toggle-include-archived" />
        Show archived
      </label>
      <div className="mt-6">
        <AccountGate><WorkoutList includeArchived={includeArchived} /></AccountGate>
      </div>
    </PageFrame>
  );
}
