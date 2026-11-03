import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useSearch } from 'wouter';
import {
  useCreateSession, useGetWorkout, getGetWorkoutQueryKey, getListSessionsQueryKey, getGetSessionQueryKey, getGetDashboardQueryKey,
  getGetCurrentUserQueryKey, type AppUser, type SessionInput, type WorkoutVersionRecord,
} from '@workspace/api-client-react';
import { SessionForm } from '@/components/session-form';
import { AccountGate, ErrorPanel, PageFrame, SkeletonBlock, errorMessage, errorStatus } from '@/components/session-shell';

function NewSessionForm({ templateVersion }: { templateVersion?: WorkoutVersionRecord }) {
  const qc = useQueryClient();
  const create = useCreateSession();
  const submit = async (data: SessionInput) => {
    const owner = qc.getQueryData<AppUser>(getGetCurrentUserQueryKey())?.id;
    if (!owner) throw new Error('Your account could not be confirmed. Your draft is unchanged.');
    const saved = await create.mutateAsync({ data });
    if (qc.getQueryData<AppUser>(getGetCurrentUserQueryKey())?.id !== owner) {
      throw new Error('The session was saved in the original account. Return to that account to view it.');
    }
    qc.setQueryData(getGetSessionQueryKey(saved.id), saved);
    await qc.invalidateQueries({ queryKey: getListSessionsQueryKey() });
    await qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
    return saved;
  };
  return <SessionForm mode="create" cancelTo={templateVersion ? `/workouts/${templateVersion.workoutId}` : '/sessions'} onSubmit={submit} templateVersion={templateVersion} />;
}

function TemplateUnavailable({ title, message }: { title: string; message: string }) {
  return (
    <PageFrame>
      <div className="rounded-3xl border border-border bg-card p-8" data-testid="status-template-unavailable">
        <h2 className="text-2xl font-black uppercase">{title}</h2>
        <p className="mt-2 text-muted-foreground">{message}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/workouts" className="inline-flex h-12 items-center rounded-xl bg-primary px-5 font-bold text-primary-foreground" data-testid="link-template-back">Back to workouts</Link>
        </div>
      </div>
    </PageFrame>
  );
}

/** Loads the template once, then pins its latest concrete version for the life of this draft. */
function TemplateSession({ workoutId }: { workoutId: number }) {
  const q = useGetWorkout(workoutId, { query: { queryKey: getGetWorkoutQueryKey(workoutId), refetchOnMount: 'always', refetchOnWindowFocus: false, retry: false } });
  const [pinned, setPinned] = useState<WorkoutVersionRecord | null>(null);
  // Never pin a cached copy: wait for this mount's own successful request.
  const fresh = !!q.data && q.isFetchedAfterMount && !q.isFetching && !q.isError;
  if (!pinned && fresh && !q.data!.archived && q.data!.versions[0]) setPinned(q.data!.versions[0]);

  if (pinned) return <NewSessionForm templateVersion={pinned} />;
  if (q.isError) {
    if (errorStatus(q.error) === 404) return <TemplateUnavailable title="Workout not found." message="This workout is not in your ledger, so no session was started." />;
    return <PageFrame><ErrorPanel title="The workout did not load." message={errorMessage(q.error)} onRetry={() => q.refetch()} retrying={q.isFetching} testid="status-template-error" /></PageFrame>;
  }
  if (fresh && q.data!.archived) return <TemplateUnavailable title="This workout is archived." message="Restore it before starting a session from it. Nothing was logged." />;
  if (fresh) return <TemplateUnavailable title="No saved version." message="This workout has no version to start from." />;
  return <PageFrame><SkeletonBlock testid="status-template-loading" rows={2} /></PageFrame>;
}

export default function NewSessionPage() {
  const search = useSearch();
  const raw = new URLSearchParams(search).get('workoutId');
  if (raw === null) {
    return <AccountGateFrame><NewSessionForm /></AccountGateFrame>;
  }
  const workoutId = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(workoutId) || workoutId < 1 || workoutId > 2147483647) {
    return <TemplateUnavailable title="Invalid workout link." message="That start link does not point to a workout. No session was started." />;
  }
  return (
    <AccountGateFrame>
      <TemplateSession key={workoutId} workoutId={workoutId} />
    </AccountGateFrame>
  );
}

/** Shows the account gate inside page chrome until the account is confirmed. */
export function AccountGateFrame({ children }: { children: ReactNode }) {
  return (
    <AccountGate fallbackWrap={(node) => <PageFrame>{node}</PageFrame>}>
      {children}
    </AccountGate>
  );
}
