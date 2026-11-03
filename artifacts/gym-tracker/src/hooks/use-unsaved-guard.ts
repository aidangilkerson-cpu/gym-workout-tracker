import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';

/**
 * Guards a page against losing unsaved data (dirty) or leaving mid-request (busy).
 * - beforeunload warns while dirty OR busy.
 * - A same-URL sentinel history entry intercepts browser back; while busy, back is blocked;
 *   while dirty, back asks for confirmation.
 * - go(to) consumes the sentinel, then REPLACES the original page entry with `to`,
 *   so browser back after a save/delete cannot reopen the form.
 */
export function useUnsavedGuard(dirty: boolean, busy = false) {
  const [, setLocation] = useLocation();
  const [pending, setPending] = useState<string | 'back' | null>(null);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const sentinelRef = useRef(false);
  const releasedRef = useRef(false);
  const targetRef = useRef<string | null>(null);
  const setLocationRef = useRef(setLocation);
  setLocationRef.current = setLocation;

  const pushSentinel = () => {
    window.history.pushState({ ...(window.history.state ?? {}), liftGuard: true }, '', window.location.href);
    sentinelRef.current = true;
  };

  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (releasedRef.current) return;
      if (dirtyRef.current || busyRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);

  useEffect(() => {
    if ((dirty || busy) && !sentinelRef.current && !releasedRef.current) pushSentinel();
  }, [dirty, busy]);

  useEffect(() => {
    const onPop = () => {
      // Sentinel consumed by go(): now on the original page entry; replace it with the target.
      if (targetRef.current) {
        const t = targetRef.current;
        targetRef.current = null;
        setLocationRef.current(t, { replace: true });
        return;
      }
      if (releasedRef.current || !sentinelRef.current) return;
      sentinelRef.current = false;
      if (busyRef.current) {
        pushSentinel();
        return;
      }
      if (dirtyRef.current) {
        pushSentinel();
        setPending('back');
        return;
      }
      window.history.back();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  /** Leave for good (after successful save/delete or confirmed discard). */
  const go = useCallback((to: string) => {
    releasedRef.current = true;
    if (sentinelRef.current) {
      sentinelRef.current = false;
      targetRef.current = to;
      window.history.back();
    } else {
      setLocationRef.current(to, { replace: true });
    }
  }, []);

  /** Stop guarding without navigating (e.g. confirmed logout). */
  const release = useCallback(() => {
    releasedRef.current = true;
  }, []);

  /** In-app navigation request: blocked while busy, confirmed while dirty. */
  const leave = useCallback((to: string) => {
    if (busyRef.current) return;
    if (dirtyRef.current) setPending(to);
    else go(to);
  }, [go]);

  const confirmDiscard = useCallback(() => {
    const target = pending;
    setPending(null);
    if (busyRef.current) return;
    if (target === 'back') {
      releasedRef.current = true;
      sentinelRef.current = false;
      window.history.go(-2);
    } else if (target) {
      go(target);
    }
  }, [pending, go]);

  const cancelDiscard = useCallback(() => setPending(null), []);

  return { leave, go, release, discardOpen: pending !== null, confirmDiscard, cancelDiscard };
}
