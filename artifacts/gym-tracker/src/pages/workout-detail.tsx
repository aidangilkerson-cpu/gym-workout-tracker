import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'wouter';
import { Archive, ArchiveRestore, Pencil, Play } from 'lucide-react';
import { useGetWorkout, useSetWorkoutArchive, getGetWorkoutQueryKey } from '@workspace/api-client-react';
import { AccountGate, ErrorPanel, PageFrame, SkeletonBlock, errorMessage, errorStatus } from '@/components/session-shell';
import { WorkoutNotFound, currentUserId, syncWorkout } from '@/pages/workout-edit';

const stamp = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
};

function Detail({ id }: { id: number }) {
  const qc = useQueryClient();
  const q = useGetWorkout(id, { query: { queryKey: getGetWorkoutQueryKey(id), refetchOnMount: 'always', refetchOnWindowFocus: false, retry: false } });
  const archive = useSetWorkoutArchive();
  const busyRef = useRef(false);
  const [archErr, setArchErr] = useState<string | null>(null);

  if (q.isLoading) return <SkeletonBlock testid="status-workout-loading" rows={3} />;
  if (q.isError || !q.data) {
    return errorStatus(q.error) === 404 ? <WorkoutNotFound /> : <ErrorPanel title="This workout did not load." message={errorMessage(q.error)} onRetry={() => q.refetch()} retrying={q.isFetching} testid="status-workout-error" />;
  }
  const w = q.data;
  const latest = w.versions[0];

  const toggleArchive = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setArchErr(null);
    const owner = currentUserId(qc);
    try {
      if (!owner) throw new Error('Your account could not be confirmed. Please sign in again.');
      const saved = await archive.mutateAsync({ id, data: { archived: !w.archived } });
      if (currentUserId(qc) === owner) await syncWorkout(qc, saved);
    } catch (e) {
      setArchErr(errorMessage(e));
    } finally {
      busyRef.current = false;
    }
  };

  const btn = 'inline-flex h-12 items-center gap-2 rounded-xl px-4 font-bold';
  return (
    <>
      <p className="rise font-mono text-xs uppercase tracking-[0.3em] text-primary">
        Workout {latest ? `/ v${latest.versionNumber}` : ''}{w.archived ? ' / Archived' : ''}
      </p>
      <h1 className="rise mt-3 break-words text-4xl font-black uppercase leading-[0.9] md:text-6xl" data-testid="text-workout-title">{w.name}</h1>

      <div className="mt-6 flex flex-wrap gap-2">
        {latest && !w.archived ? (
          <Link href={`/sessions/new?workoutId=${w.id}`} className={`${btn} h-14 rounded-2xl bg-primary px-6 text-primary-foreground active:scale-[0.98]`} data-testid="link-start-session">
            <Play className="h-5 w-5" /> Start session
          </Link>
        ) : (
          <button type="button" disabled className={`${btn} h-14 rounded-2xl bg-primary px-6 text-primary-foreground opacity-40`} data-testid="link-start-session" title="Restore to start sessions">
            <Play className="h-5 w-5" /> Start session
          </button>
        )}
        {w.archived ? (
          <button type="button" disabled className={`${btn} h-14 border border-border bg-card opacity-40`} data-testid="link-edit-workout"><Pencil className="h-4 w-4" /> Edit</button>
        ) : (
          <Link href={`/workouts/${w.id}/edit`} className={`${btn} h-14 border border-border bg-card hover:border-primary/60`} data-testid="link-edit-workout"><Pencil className="h-4 w-4" /> Edit</Link>
        )}
        <button type="button" onClick={toggleArchive} disabled={archive.isPending} className={`${btn} h-14 border border-border bg-card hover:border-primary/60 disabled:opacity-60`} data-testid={w.archived ? 'button-restore-workout' : 'button-archive-workout'}>
          {w.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          {archive.isPending ? 'Saving' : w.archived ? 'Restore' : 'Archive'}
        </button>
      </div>
      {w.archived && <p className="mt-3 text-sm text-muted-foreground" data-testid="status-workout-archived">Archived. History stays readable; restore to edit or start sessions.</p>}
      {archErr && <p role="alert" className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" data-testid="text-archive-error">{archErr}</p>}

      <section className="mt-12" data-testid="section-version-history">
        <h2 className="flex items-baseline justify-between border-b border-border pb-3">
          <span className="text-xl font-black uppercase">Version history</span>
          <span className="font-mono text-xs text-muted-foreground">{w.versions.length} saved</span>
        </h2>
        <ol className="mt-6 space-y-5">
          {w.versions.map((v, idx) => (
            <li key={v.id} className={`relative rounded-3xl border p-5 md:p-6 ${idx === 0 ? 'border-primary/50 bg-card' : 'border-border bg-card/50'}`} data-testid={`card-version-${v.versionNumber}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-black uppercase">
                  <span className="font-mono text-primary" data-testid={`text-version-number-${v.versionNumber}`}>v{v.versionNumber}</span>
                  <span className="ml-3">{v.workoutName}</span>
                  {idx === 0 && <span className="ml-3 rounded bg-primary px-1.5 py-0.5 font-mono text-[10px] text-primary-foreground">Latest</span>}
                </p>
                <time dateTime={v.savedAt} className="font-mono text-xs text-muted-foreground" data-testid={`text-version-saved-${v.versionNumber}`}>{stamp(v.savedAt)}</time>
              </div>
              <ol className="mt-4 grid gap-1.5 sm:grid-cols-2">
                {v.exercises.map((x, i) => (
                  <li key={x.id} className="flex gap-3 text-sm" data-testid={`text-version-${v.versionNumber}-exercise-${i}`}>
                    <span className="w-6 shrink-0 text-right font-mono text-muted-foreground">{i + 1}.</span>
                    <span className="min-w-0 break-words">{x.exerciseName}</span>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

export default function WorkoutDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  return (
    <PageFrame>
      <Link href="/workouts" className="mb-6 inline-flex text-sm font-semibold text-muted-foreground hover:text-foreground" data-testid="link-back-workouts">Back to workouts</Link>
      {!Number.isInteger(id) || id < 1 ? <WorkoutNotFound /> : <AccountGate><Detail key={id} id={id} /></AccountGate>}
    </PageFrame>
  );
}
