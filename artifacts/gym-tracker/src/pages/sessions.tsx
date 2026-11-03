import { Link, useSearch } from 'wouter';
import { useListSessions, getListSessionsQueryKey } from '@workspace/api-client-react';
import { ArrowRight, Plus } from 'lucide-react';
import { AccountGate, ErrorPanel, PageFrame, SkeletonBlock, errorMessage, formatDate } from '@/components/session-shell';
import { SessionStar } from '@/components/session-star';
import { SessionFilters } from '@/components/session-filters';
import { readSessionFilters, sessionListUrl } from '@/lib/session-filters';

function SessionList() {
  const search = useSearch();
  const state = readSessionFilters(search);
  const { starredOnly } = state;
  const params = { starredOnly: starredOnly ? 'true' as const : undefined, q: state.q || undefined, sort: state.sort };
  const list = useListSessions(params, { query: { queryKey: getListSessionsQueryKey(params), refetchOnMount: 'always' } });
  const filters = <SessionFilters key={search} filters={state} />;

  if (list.isLoading) return <>{filters}<SkeletonBlock testid="status-sessions-loading" /></>;
  if (list.isError) {
    return (
      <>{filters}<ErrorPanel
        title="Your sessions did not load."
        message={errorMessage(list.error)}
        onRetry={() => list.refetch()}
        retrying={list.isFetching}
        testid="status-sessions-error"
      /></>
    );
  }
  const sessions = list.data ?? [];

  if (sessions.length === 0 && state.q.trim()) {
    return <>{filters}<div role="status" className="rounded-3xl border border-dashed border-border bg-card/60 p-8 text-center" data-testid="status-sessions-no-results">
      <h2 className="text-3xl font-black uppercase">No matching sessions.</h2>
      <p className="mt-2 break-words text-muted-foreground">No {starredOnly ? 'starred ' : ''}workout names match “{state.q}”. Try another name or clear your search.</p>
      <Link href={sessionListUrl({ ...state, q: '' })} className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-primary px-5 font-semibold text-primary-foreground">Clear search</Link>
    </div></>;
  }

  if (sessions.length === 0) {
    return (
      <>{filters}<div className="rounded-3xl border border-dashed border-border bg-card/60 p-8 text-center md:p-12" data-testid={starredOnly ? 'status-starred-empty' : 'status-sessions-empty'}>
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">Ledger empty</p>
        <h2 className="mt-3 text-3xl font-black uppercase">{starredOnly ? 'No starred sessions yet.' : 'No sessions yet.'}</h2>
        <p className="mx-auto mt-2 max-w-sm text-muted-foreground">{starredOnly ? 'Star a session to keep a favorite here. Unstarring never deletes the session.' : "Log today's lift and it lands here, dated and private to you."}</p>
        <Link href={starredOnly ? sessionListUrl({ ...state, starredOnly: false }) : '/sessions/new'} className="mt-6 inline-flex min-h-14 items-center gap-2 rounded-2xl bg-primary px-6 py-3 font-bold text-primary-foreground" data-testid="link-new-session-empty">
          {!starredOnly && <Plus className="h-5 w-5" />} {starredOnly ? 'See all sessions' : 'Log first session'}
        </Link>
      </div></>
    );
  }

  return (
    <>{filters}<ul className="space-y-3" data-testid="list-sessions">
      {sessions.map((s, i) => {
        const sets = s.exercises.reduce((n, ex) => n + ex.sets.length, 0);
        return (
          <li key={s.id} className="rise rounded-2xl border border-border bg-card" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
            <Link
              href={`/sessions/${s.id}`}
              className="group flex items-center gap-4 rounded-t-2xl p-5 transition-colors hover:bg-primary/5"
              data-testid={`link-session-${s.id}`}
            >
              <div className="w-1 self-stretch rounded-full bg-primary/70 transition-transform group-hover:scale-y-110" />
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground" data-testid={`text-session-date-${s.id}`}>{formatDate(s.date)}</p>
                <p className="mt-1 truncate text-xl font-extrabold" data-testid={`text-session-name-${s.id}`}>{s.workoutName}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {s.exercises.length} {s.exercises.length === 1 ? 'exercise' : 'exercises'} / {sets} {sets === 1 ? 'set' : 'sets'}
                </p>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
            </Link>
            <div className="px-5 pb-4">
              <SessionStar id={s.id} starred={s.starred} name={s.workoutName} />
            </div>
          </li>
        );
      })}
    </ul></>
  );
}

export default function SessionsPage() {
  return (
    <PageFrame>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="rise font-mono text-xs uppercase tracking-[0.3em] text-primary">Training ledger</p>
          <h1 className="rise mt-3 text-5xl font-black uppercase leading-[0.9] md:text-7xl" style={{ animationDelay: '60ms' }}>Sessions.</h1>
        </div>
        <div className="flex flex-wrap gap-2">
        <Link href="/workouts" className="rise inline-flex h-14 items-center gap-2 rounded-2xl border border-border bg-card px-5 font-bold hover:border-primary/60" data-testid="link-start-workout">
          Start workout
        </Link>
        <Link href="/sessions/new" className="rise inline-flex h-14 items-center gap-2 rounded-2xl bg-primary px-6 font-bold text-primary-foreground active:scale-[0.98]" data-testid="link-new-session">
          <Plus className="h-5 w-5" /> New session
        </Link>
        </div>
      </div>
      <div className="mt-8">
        <AccountGate><SessionList /></AccountGate>
      </div>
    </PageFrame>
  );
}
