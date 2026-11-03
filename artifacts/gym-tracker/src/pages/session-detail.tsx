import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'wouter';
import { useUnsavedGuard } from '@/hooks/use-unsaved-guard';
import { useGetSession, useDeleteSession, getGetSessionQueryKey, getListSessionsQueryKey, getGetDashboardQueryKey } from '@workspace/api-client-react';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { AccountGate, ErrorPanel, PageFrame, SkeletonBlock, errorMessage, errorStatus, formatDate } from '@/components/session-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { NotFoundPanel } from '@/pages/session-edit';
import { SessionStar } from '@/components/session-star';

function Detail({ id, onBusy, go }: { id: number; onBusy: (b: boolean) => void; go: (to: string) => void }) {
  const qc = useQueryClient();
  const q = useGetSession(id, { query: { queryKey: getGetSessionQueryKey(id), refetchOnMount: 'always', retry: false } });
  const del = useDeleteSession();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleting = del.isPending;
  useEffect(() => { onBusy(deleting); }, [deleting, onBusy]);

  if (q.isLoading) return <SkeletonBlock testid="status-session-loading" rows={2} />;
  if (q.isError) {
    return errorStatus(q.error) === 404 ? <NotFoundPanel /> : (
      <ErrorPanel title="This session did not load." message={errorMessage(q.error)} onRetry={() => q.refetch()} retrying={q.isFetching} testid="status-session-error" />
    );
  }
  const s = q.data;
  if (!s) return null;

  const handleDelete = async () => {
    setDeleteError(null);
    try {
      await del.mutateAsync({ id });
      qc.removeQueries({ queryKey: getGetSessionQueryKey(id) });
      await qc.invalidateQueries({ queryKey: getListSessionsQueryKey() });
      await qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      setConfirmOpen(false);
      go('/sessions');
    } catch (err) {
      setDeleteError(errorMessage(err));
    }
  };

  const exercises = [...s.exercises].sort((a, b) => a.position - b.position);

  return (
    <>
      <p className="rise font-mono text-xs uppercase tracking-[0.3em] text-primary" data-testid="text-session-date">{formatDate(s.date)}</p>
      <h1 className="rise mt-3 break-words text-4xl font-black uppercase leading-[0.9] md:text-6xl" style={{ animationDelay: '60ms' }} data-testid="text-session-name">{s.workoutName}</h1>

      <div className="rise mt-6 flex flex-wrap gap-3" style={{ animationDelay: '100ms' }}>
        <SessionStar id={id} starred={s.starred} name={s.workoutName} />
        <Link href={`/sessions/${id}/edit`} className="inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-5 font-bold text-primary-foreground" data-testid="link-edit-session">
          <Pencil className="h-4 w-4" /> Edit
        </Link>
        <button
          type="button"
          onClick={() => { setDeleteError(null); setConfirmOpen(true); }}
          disabled={del.isPending}
          className="inline-flex h-12 items-center gap-2 rounded-xl border border-border bg-card px-5 font-semibold hover:border-destructive/60 hover:text-destructive disabled:opacity-60"
          data-testid="button-delete-session"
        >
          <Trash2 className="h-4 w-4" /> Delete
        </button>
      </div>

      {s.notes && (
        <section className="rise mt-8 rounded-3xl border border-border bg-card p-5 md:p-7" style={{ animationDelay: '140ms' }}>
          <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Notes</h2>
          <p className="mt-2 whitespace-pre-wrap" data-testid="text-session-notes">{s.notes}</p>
        </section>
      )}

      <ol className="mt-6 space-y-3">
        {exercises.map((ex, i) => {
          const sets = [...ex.sets].sort((a, b) => a.setNumber - b.setNumber);
          return (
            <li key={ex.id} className="rise rounded-3xl border border-border bg-card p-5 md:p-6" style={{ animationDelay: `${180 + i * 40}ms` }} data-testid={`card-exercise-${ex.id}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-xl font-extrabold"><span className="mr-2 font-mono text-xs text-primary">{String(i + 1).padStart(2, '0')}</span><span data-testid={`text-exercise-name-${ex.id}`}>{ex.exerciseName}</span></h3>
                <p className="font-mono text-sm" data-testid={`text-exercise-weight-${ex.id}`}><span className="text-2xl font-bold text-primary">{ex.weightLb}</span> lb</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2" data-testid={`list-sets-${ex.id}`}>
                {sets.map((set) => (
                  <span key={set.id} className="inline-flex flex-col items-center rounded-xl border border-border bg-secondary px-3 py-2 font-mono">
                    <span className="text-[10px] uppercase text-muted-foreground">Set {set.setNumber}</span>
                    <span className="text-lg font-bold" data-testid={`text-set-reps-${set.id}`}>{set.reps}</span>
                  </span>
                ))}
              </div>
            </li>
          );
        })}
      </ol>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete this session?"
        description={`"${s.workoutName}" on ${formatDate(s.date)} and all of its exercises will be removed from your ledger. This cannot be undone.`}
        confirmLabel="Delete session"
        cancelLabel="Keep it"
        pending={del.isPending}
        error={deleteError}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
        testid="delete"
      />
    </>
  );
}

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const valid = Number.isInteger(id) && id > 0;
  const [busy, setBusy] = useState(false);
  const guard = useUnsavedGuard(false, busy);
  return (
    <PageFrame onNavigate={guard.leave} busy={busy}>
      <Link href="/sessions" className="mb-6 inline-flex h-10 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary" data-testid="link-back-sessions">
        <ArrowLeft className="h-4 w-4" /> All sessions
      </Link>
      {valid ? <AccountGate><Detail id={id} onBusy={setBusy} go={guard.go} /></AccountGate> : <NotFoundPanel />}
    </PageFrame>
  );
}
