import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { readSessionFilters, sessionListUrl } from '@/lib/session-filters';

export function SessionFilters({ filters }: { filters: ReturnType<typeof readSessionFilters> }) {
  const [, navigate] = useLocation();
  const [draft, setDraft] = useState(filters.q);
  function submit(event: FormEvent) {
    event.preventDefault();
    navigate(sessionListUrl({ ...filters, q: draft }));
  }
  const viewLink = (starredOnly: boolean) => sessionListUrl({ ...filters, q: draft, starredOnly });
  return (
    <div className="mb-6 space-y-4">
      <nav aria-label="Session views" className="flex flex-wrap gap-2">
        {[false, true].map(starred => (
          <Link key={String(starred)} href={viewLink(starred)} aria-current={filters.starredOnly === starred ? 'page' : undefined}
            className={`inline-flex min-h-12 items-center rounded-xl border px-4 font-semibold ${filters.starredOnly === starred ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-primary'}`}
            data-testid={starred ? 'filter-starred-sessions' : 'filter-all-sessions'}>{starred ? 'Starred only' : 'All sessions'}</Link>
        ))}
      </nav>
      <form onSubmit={submit} role="search" aria-label="Find workout sessions" className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <label htmlFor="session-search" className="mb-2 block text-sm font-semibold">Workout name</label>
          <div className="flex gap-2">
            <input id="session-search" type="search" maxLength={120} value={draft} onChange={e => setDraft(e.target.value)}
              placeholder="Search workout names" data-testid="input-session-search"
              className="min-h-12 min-w-0 flex-1 rounded-xl border border-border bg-card px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" />
            <button type="submit" data-testid="button-search-sessions" className="min-h-12 rounded-xl bg-primary px-4 font-semibold text-primary-foreground">Search</button>
          </div>
        </div>
        <div>
          <label htmlFor="session-sort" className="mb-2 block text-sm font-semibold">Date order</label>
          <select id="session-sort" value={filters.sort} onChange={e => navigate(sessionListUrl({ ...filters, q: draft, sort: e.target.value === 'oldest' ? 'oldest' : 'newest' }))}
            data-testid="select-session-sort" className="min-h-12 w-full rounded-xl border border-border bg-card px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
            <option value="newest">Newest first</option><option value="oldest">Oldest first</option>
          </select>
        </div>
      </form>
      {filters.q && <Link href={sessionListUrl({ ...filters, q: '' })} data-testid="button-clear-session-search"
        className="inline-flex min-h-10 items-center font-semibold text-primary underline underline-offset-4">Clear search</Link>}
    </div>
  );
}
