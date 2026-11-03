import { useState, type MouseEvent, type ReactNode } from 'react';
import { useAuth, useClerk } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { useGetCurrentUser, getGetCurrentUserQueryKey } from '@workspace/api-client-react';
import { LogOut, RotateCw } from 'lucide-react';
import { BrandMark } from '@/components/brand';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

type NavGuard = { busy?: boolean; confirmLogout?: () => boolean };

export function AppNav({ busy, confirmLogout }: NavGuard) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);

  const items = [
    { href: '/dashboard', label: 'Dashboard', testid: 'link-nav-dashboard', active: location === '/dashboard' },
    { href: '/sessions', label: 'Sessions', testid: 'link-nav-sessions', active: location.startsWith('/sessions') },
    { href: '/workouts', label: 'Workouts', testid: 'link-nav-workouts', active: location.startsWith('/workouts') },
    { href: '/user-portal', label: 'Account', testid: 'link-nav-account', active: location === '/user-portal' },
  ];

  const handleLogout = async () => {
    if (busy) return;
    if (confirmLogout && !confirmLogout()) return;
    setSigningOut(true);
    queryClient.clear();
    await signOut({ redirectUrl: basePath || '/' });
  };

  return (
    <header className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-5 py-6 md:px-8">
      <BrandMark />
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <nav aria-label="Main" className="flex min-w-0 flex-wrap rounded-xl border border-border bg-card p-1">
          {items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              aria-current={it.active ? 'page' : undefined}
              className={`inline-flex h-10 items-center rounded-lg px-2 text-sm sm:px-3.5 font-bold transition-colors ${it.active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              data-testid={it.testid}
            >
              {it.label}
            </Link>
          ))}
        </nav>
        <button
          type="button"
          onClick={handleLogout}
          disabled={signingOut || busy}
          aria-label="Log out"
          className="inline-flex h-12 items-center gap-2 rounded-xl border border-border bg-card px-3.5 text-sm font-semibold transition-colors hover:border-destructive/60 hover:text-destructive disabled:opacity-60"
          data-testid="button-logout"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">{signingOut ? 'Signing out' : 'Log out'}</span>
        </button>
      </div>
    </header>
  );
}

/** Waits for the account to be provisioned/verified before rendering session data. */
export function AccountGate({ children, fallbackWrap }: { children: ReactNode; fallbackWrap?: (node: ReactNode) => ReactNode }) {
  const wrap = (n: ReactNode) => <>{fallbackWrap ? fallbackWrap(n) : n}</>;
  const { isLoaded, isSignedIn } = useAuth();
  const me = useGetCurrentUser({
    query: { queryKey: getGetCurrentUserQueryKey(), enabled: isLoaded && !!isSignedIn, retry: false },
  });

  if (me.isError) {
    return wrap(
      <div className="rounded-3xl border border-border bg-card p-6 md:p-9" data-testid="status-account-error">
        <h2 className="text-2xl font-extrabold">We could not reach your account.</h2>
        <p className="mt-2 text-muted-foreground">Your sessions stay locked until the training server confirms who you are.</p>
        <button
          type="button"
          onClick={() => me.refetch()}
          disabled={me.isFetching}
          className="mt-6 inline-flex h-14 items-center gap-2 rounded-2xl bg-primary px-6 font-bold text-primary-foreground active:scale-[0.98] disabled:opacity-60"
          data-testid="button-retry-account"
        >
          <RotateCw className={`h-5 w-5 ${me.isFetching ? 'animate-spin' : ''}`} />
          {me.isFetching ? 'Retrying' : 'Retry'}
        </button>
      </div>
    );
  }
  if (!me.isSuccess || !me.data) return wrap(<SkeletonBlock testid="status-account-loading" />);
  return <>{children}</>;
}

export function SkeletonBlock({ testid, rows = 3 }: { testid: string; rows?: number }) {
  return (
    <div className="space-y-3" data-testid={testid} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-card p-5">
          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-6 w-2/3 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-3 w-1/3 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

export function ErrorPanel({ title, message, onRetry, retrying, testid }: { title: string; message: string; onRetry: () => void; retrying: boolean; testid: string }) {
  return (
    <div className="rounded-3xl border border-destructive/40 bg-card p-6 md:p-8" data-testid={testid} role="alert">
      <h2 className="text-xl font-extrabold">{title}</h2>
      <p className="mt-2 text-muted-foreground">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="mt-5 inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-5 font-bold text-primary-foreground disabled:opacity-60"
        data-testid="button-retry"
      >
        <RotateCw className={`h-4 w-4 ${retrying ? 'animate-spin' : ''}`} />
        {retrying ? 'Retrying' : 'Retry'}
      </button>
    </div>
  );
}

export function PageFrame({ children, onNavigate, busy, confirmLogout }: { children: ReactNode; onNavigate?: (to: string) => void } & NavGuard) {
  // Route every internal link click (brand, nav, back links) through the guard.
  const onClickCapture = (e: MouseEvent<HTMLDivElement>) => {
    if (!onNavigate || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
    if (!a || (a.target && a.target !== '_self')) return;
    const url = new URL(a.href, window.location.href);
    if (url.origin !== window.location.origin) return;
    let path = url.pathname;
    if (basePath && path.startsWith(basePath)) path = path.slice(basePath.length) || '/';
    e.preventDefault();
    e.stopPropagation();
    onNavigate(path + url.search);
  };
  return (
    <div className="grain plates min-h-[100dvh] bg-background text-foreground" onClickCapture={onClickCapture}>
      <AppNav busy={busy} confirmLogout={confirmLogout} />
      <main className="mx-auto max-w-3xl px-5 pb-20 pt-4 md:px-8 md:pt-8">{children}</main>
    </div>
  );
}

export function errorMessage(err: unknown): string {
  const e = err as { data?: { error?: string }; message?: string } | null;
  return e?.data?.error || e?.message || 'Something went wrong.';
}

export function errorStatus(err: unknown): number | undefined {
  return (err as { status?: number } | null)?.status;
}

export function formatDate(d: string) {
  const [y, m, day] = d.split('-').map(Number);
  if (!y || !m || !day) return d;
  return new Date(y, m - 1, day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
