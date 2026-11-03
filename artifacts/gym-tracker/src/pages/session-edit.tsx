import { useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'wouter';
import { useGetSession, useUpdateSession, getGetSessionQueryKey, getListSessionsQueryKey, getGetDashboardQueryKey, type SessionInput } from '@workspace/api-client-react';
import { SessionForm } from '@/components/session-form';
import { ErrorPanel, PageFrame, SkeletonBlock, errorMessage, errorStatus } from '@/components/session-shell';
import { AccountGateFrame } from '@/pages/session-new';

export function NotFoundPanel() {
  return (
    <div className="rounded-3xl border border-border bg-card p-8" data-testid="status-session-not-found">
      <h2 className="text-2xl font-black uppercase">Session not found.</h2>
      <p className="mt-2 text-muted-foreground">It may have been deleted, or it is not in your ledger.</p>
      <Link href="/sessions" className="mt-5 inline-flex h-12 items-center rounded-xl bg-primary px-5 font-bold text-primary-foreground" data-testid="link-notfound-sessions">Back to sessions</Link>
    </div>
  );
}

function EditLoader({ id }: { id: number }) {
  const qc = useQueryClient();
  const q = useGetSession(id, { query: { queryKey: getGetSessionQueryKey(id), refetchOnMount: 'always', refetchOnWindowFocus: false, retry: false } });
  const update = useUpdateSession();

  // Wait for a fresh server copy so the form never initializes from stale cache.
  if (q.isLoading || (q.isFetching && !q.isError && q.isStale)) return <PageFrame><SkeletonBlock testid="status-session-loading" rows={2} /></PageFrame>;
  if (q.isError) {
    return (
      <PageFrame>
        {errorStatus(q.error) === 404 ? <NotFoundPanel /> : (
          <ErrorPanel title="This session did not load." message={errorMessage(q.error)} onRetry={() => q.refetch()} retrying={q.isFetching} testid="status-session-error" />
        )}
      </PageFrame>
    );
  }
  if (!q.data) return null;

  const submit = async (data: SessionInput) => {
    const saved = await update.mutateAsync({ id, data });
    qc.setQueryData(getGetSessionQueryKey(id), saved);
    await qc.invalidateQueries({ queryKey: getListSessionsQueryKey() });
    await qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
    return saved;
  };
  return <SessionForm key={id} mode="edit" initial={q.data} cancelTo={`/sessions/${id}`} onSubmit={submit} />;
}

export default function EditSessionPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) return <PageFrame><NotFoundPanel /></PageFrame>;
  return <AccountGateFrame><EditLoader id={id} /></AccountGateFrame>;
}
