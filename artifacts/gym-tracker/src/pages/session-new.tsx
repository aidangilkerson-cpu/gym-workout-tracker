import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useSearch } from 'wouter';
import {
  useCreateSession, useGetWorkout, useGetSession, useListSessions, getGetWorkoutQueryKey, getListSessionsQueryKey, getGetSessionQueryKey, getGetDashboardQueryKey,
  getGetCurrentUserQueryKey, useListExercises, getListExercisesQueryKey, type AppUser, type SessionInput, type WorkoutVersionRecord, type WorkoutSessionRecord, type DashboardExercise,
} from '@workspace/api-client-react';
import { SessionForm } from '@/components/session-form';
import { latestWorkoutSession, repeatSessionSeed, templateSessionSeed, type SessionSeed } from '@/lib/session-seed';
import { AccountGate, ErrorPanel, PageFrame, SkeletonBlock, errorMessage, errorStatus } from '@/components/session-shell';

function NewSessionForm({ templateVersion, seed, cancelTo }: { templateVersion?: WorkoutVersionRecord; seed?: SessionSeed; cancelTo?: string }) {
  const qc = useQueryClient();
  const create = useCreateSession();
  const history = useListSessions(undefined, { query: { refetchOnMount: 'always', refetchOnWindowFocus: false, retry: false } });
  const library = useListExercises({ query: { refetchOnMount: 'always', refetchOnWindowFocus: false, retry: false } });
  const [noteContext, setNoteContext] = useState<{ history: WorkoutSessionRecord[]; library: DashboardExercise[] } | null>(null);
  // Pin fresh owned data before mounting the form. Later refetches never replace a draft.
  if (!noteContext && history.isFetchedAfterMount && !history.isFetching && !history.isError && history.data &&
      library.isFetchedAfterMount && !library.isFetching && !library.isError && library.data) {
    setNoteContext({ history: history.data, library: library.data });
  }
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
    await qc.invalidateQueries({ queryKey: getListExercisesQueryKey() });
    return saved;
  };
  if (!noteContext) {
    if (history.isError || library.isError) return <PageFrame><ErrorPanel title="Your exercise notes did not load." message="Nothing was logged. Reload your history and exercise library before starting this draft." onRetry={() => { void history.refetch(); void library.refetch(); }} retrying={history.isFetching || library.isFetching} testid="status-note-history-error" /></PageFrame>;
    return <PageFrame><SkeletonBlock testid="status-note-history-loading" rows={2} /></PageFrame>;
  }
  return <SessionForm mode="create" seed={seed} noteHistory={noteContext.history} exerciseLibrary={noteContext.library} cancelTo={cancelTo ?? (templateVersion ? `/workouts/${templateVersion.workoutId}` : '/sessions')} onSubmit={submit} templateVersion={templateVersion} />;
}

function TemplateUnavailable({ title, message, backTo = '/workouts', backLabel = 'Back to workouts' }: { title: string; message: string; backTo?: string; backLabel?: string }) {
  return (
    <PageFrame>
      <div className="rounded-3xl border border-border bg-card p-8" data-testid="status-template-unavailable">
        <h2 className="text-2xl font-black uppercase">{title}</h2>
        <p className="mt-2 text-muted-foreground">{message}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href={backTo} className="inline-flex h-12 items-center rounded-xl bg-primary px-5 font-bold text-primary-foreground" data-testid="link-template-back">{backLabel}</Link>
        </div>
      </div>
    </PageFrame>
  );
}

/** Loads the template once, then pins its latest concrete version for the life of this draft. */
function TemplateSession({ workoutId }: { workoutId: number }) {
  const q = useGetWorkout(workoutId, { query: { queryKey: getGetWorkoutQueryKey(workoutId), refetchOnMount: 'always', refetchOnWindowFocus: false, retry: false } });
  const h = useListSessions(undefined, { query: { refetchOnMount: 'always', refetchOnWindowFocus: false, retry: false } });
  const [pinned, setPinned] = useState<{ version: WorkoutVersionRecord; seed: SessionSeed } | null>(null);
  // Never pin a cached copy: wait for this mount's own successful request.
  const fresh = !!q.data && q.isFetchedAfterMount && !q.isFetching && !q.isError;
  const historyFresh = !!h.data && h.isFetchedAfterMount && !h.isFetching && !h.isError;
  if (!pinned && fresh && historyFresh && !q.data!.archived && q.data!.versions[0]) {
    const version = q.data!.versions[0];
    setPinned({ version, seed: templateSessionSeed(version, latestWorkoutSession(h.data!, q.data!.versions)) });
  }

  if (pinned) return <NewSessionForm templateVersion={pinned.version} seed={pinned.seed} />;
  if (q.isError) {
    if (errorStatus(q.error) === 404) return <TemplateUnavailable title="Workout not found." message="This workout is not in your ledger, so no session was started." />;
    return <PageFrame><ErrorPanel title="The workout did not load." message={errorMessage(q.error)} onRetry={() => q.refetch()} retrying={q.isFetching} testid="status-template-error" /></PageFrame>;
  }
  if (fresh && q.data!.archived) return <TemplateUnavailable title="This workout is archived." message="Restore it before starting a session from it. Nothing was logged." />;
  if (fresh && !q.data!.versions[0]) return <TemplateUnavailable title="No saved version." message="This workout has no version to start from." />;
  if (h.isError) {
    return <PageFrame><ErrorPanel title="Your previous sessions did not load." message={`${errorMessage(h.error)} Last-time numbers are needed before this draft starts. Nothing was logged.`} onRetry={() => h.refetch()} retrying={h.isFetching} testid="status-template-history-error" /></PageFrame>;
  }
  return <PageFrame><SkeletonBlock testid="status-template-loading" rows={2} /></PageFrame>;
}

/** Loads the source session fresh, then pins a copy-to-today draft. Nothing is written until Save. */
function RepeatSession({ sessionId }: { sessionId: number }) {
  const q = useGetSession(sessionId, { query: { queryKey: getGetSessionQueryKey(sessionId), refetchOnMount: 'always', refetchOnWindowFocus: false, retry: false } });
  const [seed, setSeed] = useState<SessionSeed | null>(null);
  const fresh = !!q.data && q.isFetchedAfterMount && !q.isFetching && !q.isError;
  if (!seed && fresh) setSeed(repeatSessionSeed(q.data!));

  if (seed) return <NewSessionForm seed={seed} cancelTo={`/sessions/${sessionId}`} />;
  if (q.isError) {
    if (errorStatus(q.error) === 404) {
      return <TemplateUnavailable title="Session not available." message="That session is not in your ledger, so there is nothing to repeat. No session was started." backTo="/sessions" backLabel="Back to sessions" />;
    }
    return <PageFrame><ErrorPanel title="The session to repeat did not load." message={`${errorMessage(q.error)} Nothing was logged.`} onRetry={() => q.refetch()} retrying={q.isFetching} testid="status-repeat-error" /></PageFrame>;
  }
  return <PageFrame><SkeletonBlock testid="status-repeat-loading" rows={2} /></PageFrame>;
}

function parseId(raw: string): number | null {
  const n = /^\d+$/.test(raw) ? Number(raw) : NaN;
  return Number.isSafeInteger(n) && n >= 1 && n <= 2147483647 ? n : null;
}

export default function NewSessionPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const raw = params.get('workoutId');
  const rawRepeat = params.get('repeatSessionId');
  if ((raw !== null && rawRepeat !== null) || params.getAll('workoutId').length > 1 || params.getAll('repeatSessionId').length > 1) {
    return <TemplateUnavailable title="Ambiguous start link." message="Use exactly one workout or one session to repeat. No session was started." backTo="/sessions" backLabel="Back to sessions" />;
  }
  if (rawRepeat !== null) {
    const sessionId = parseId(rawRepeat);
    if (sessionId === null) {
      return <TemplateUnavailable title="Invalid repeat link." message="That link does not point to a session. No session was started." backTo="/sessions" backLabel="Back to sessions" />;
    }
    return <AccountGateFrame><RepeatSession key={sessionId} sessionId={sessionId} /></AccountGateFrame>;
  }
  if (raw === null) {
    return <AccountGateFrame><NewSessionForm /></AccountGateFrame>;
  }
  const workoutId = parseId(raw);
  if (workoutId === null) {
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
