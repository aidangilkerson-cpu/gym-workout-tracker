import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { useSetSessionStar, getGetSessionQueryKey, getListSessionsQueryKey, getGetCurrentUserQueryKey, type AppUser } from '@workspace/api-client-react';

export function SessionStar({ id, starred, name }: { id: number; starred: boolean; name: string }) {
  const qc = useQueryClient();
  const mutation = useSetSessionStar();
  const [error, setError] = useState(false);
  const errorId = `star-error-${id}`;

  const save = async () => {
    if (mutation.isPending) return;
    setError(false);
    const accountId = qc.getQueryData<AppUser>(getGetCurrentUserQueryKey())?.id;
    if (!accountId) {
      setError(true);
      return;
    }
    try {
      const saved = await mutation.mutateAsync({ id, data: { starred: !starred } });
      // A late response must not repopulate private caches after an auth change.
      if (qc.getQueryData<AppUser>(getGetCurrentUserQueryKey())?.id !== accountId) return;
      qc.setQueryData(getGetSessionQueryKey(id), saved);
      await qc.invalidateQueries({ queryKey: getListSessionsQueryKey() });
    } catch {
      setError(true);
    }
  };

  return (
    <div className="shrink-0">
      <button
        type="button"
        aria-label={`${starred ? 'Unstar' : 'Star'} ${name}`}
        aria-pressed={starred}
        aria-busy={mutation.isPending}
        aria-describedby={error ? errorId : undefined}
        disabled={mutation.isPending}
        onClick={save}
        className={`inline-flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60 ${starred ? 'border-primary/60 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:border-primary hover:text-primary'}`}
        data-testid={`button-star-${id}`}
      >
        <Star className="h-5 w-5" fill={starred ? 'currentColor' : 'none'} aria-hidden="true" />
        <span>{mutation.isPending ? 'Saving…' : starred ? 'Starred' : 'Star'}</span>
      </button>
      {error && (
        <p id={errorId} role="alert" className="mt-2 max-w-52 text-sm text-destructive" data-testid={`error-star-${id}`}>
          Star change wasn&apos;t confirmed. Please try again.
        </p>
      )}
    </div>
  );
}
