import { useState } from 'react';
import { useAuth, useClerk } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetCurrentUser,
  getGetCurrentUserQueryKey,
  useHealthCheck,
  getHealthCheckQueryKey,
} from '@workspace/api-client-react';
import { LogOut, RotateCw, ShieldCheck } from 'lucide-react';
import { BrandMark } from '@/components/brand';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function ServiceStatus() {
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), retry: false } });
  const state = health.isLoading ? 'checking' : health.isError ? 'unreachable' : health.data?.status ?? 'unknown';
  const ok = !health.isLoading && !health.isError && health.data?.status === 'ok';
  return (
    <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground" data-testid="status-service">
      <span className={`h-2 w-2 rounded-full ${ok ? 'bg-primary' : health.isLoading ? 'bg-muted-foreground animate-pulse' : 'bg-destructive'}`} />
      Service: {state}
    </div>
  );
}

export default function UserPortalPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);

  const me = useGetCurrentUser({
    query: { queryKey: getGetCurrentUserQueryKey(), enabled: isLoaded && !!isSignedIn, retry: false },
  });

  const handleLogout = async () => {
    setSigningOut(true);
    queryClient.clear();
    await signOut({ redirectUrl: basePath || '/' });
  };

  return (
    <div className="grain plates min-h-[100dvh] bg-background text-foreground">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-6 md:px-8">
        <BrandMark />
        <button
          type="button"
          onClick={handleLogout}
          disabled={signingOut}
          className="inline-flex h-12 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold transition-colors hover:border-destructive/60 hover:text-destructive disabled:opacity-60"
          data-testid="button-logout"
        >
          <LogOut className="h-4 w-4" />
          {signingOut ? 'Signing out' : 'Log out'}
        </button>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-16 pt-6 md:px-8 md:pt-14">
        <p className="rise font-mono text-xs uppercase tracking-[0.3em] text-primary">Your account</p>
        <h1 className="rise mt-4 text-5xl font-black uppercase leading-[0.9] md:text-7xl" style={{ animationDelay: '80ms' }}>Locked in.</h1>

        <section className="rise mt-10 rounded-3xl border border-border bg-card p-6 md:p-9" style={{ animationDelay: '160ms' }}>
          {(!isLoaded || me.isLoading || (me.isFetching && !me.data && !me.isError)) && (
            <div className="space-y-4" data-testid="status-account-loading">
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              <div className="h-8 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          )}

          {me.isError && (
            <div data-testid="status-account-error">
              <h2 className="text-2xl font-extrabold">We could not reach your account.</h2>
              <p className="mt-2 text-muted-foreground">You are signed in, but the training server did not confirm your account. Give it another try.</p>
              <button
                type="button"
                onClick={() => me.refetch()}
                disabled={me.isFetching}
                className="mt-6 inline-flex h-14 items-center gap-2 rounded-2xl bg-primary px-6 font-bold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
                data-testid="button-retry-account"
              >
                <RotateCw className={`h-5 w-5 ${me.isFetching ? 'animate-spin' : ''}`} />
                {me.isFetching ? 'Retrying' : 'Retry'}
              </button>
            </div>
          )}

          {me.isSuccess && me.data && (
            <div data-testid="card-account">
              <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                <ShieldCheck className="h-5 w-5" /> Account linked
              </div>
              <p className="mt-6 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Signed in as</p>
              <p className="mt-2 break-all text-2xl font-extrabold md:text-3xl" data-testid="text-email">{me.data.email}</p>
              <dl className="mt-8 grid gap-4 border-t border-border pt-6 sm:grid-cols-2">
                <div>
                  <dt className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Member ID</dt>
                  <dd className="mt-1 break-all font-mono text-sm" data-testid="text-user-id">{me.data.id}</dd>
                </div>
                <div>
                  <dt className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Sign-in ID</dt>
                  <dd className="mt-1 break-all font-mono text-sm" data-testid="text-auth-id">{me.data.authId}</dd>
                </div>
              </dl>
            </div>
          )}
        </section>

        <div className="mt-6"><ServiceStatus /></div>
      </main>
    </div>
  );
}
