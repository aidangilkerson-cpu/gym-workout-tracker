import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { useListExercises, getListExercisesQueryKey, type WorkoutDetail, type WorkoutInput } from '@workspace/api-client-react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageFrame, errorMessage, errorStatus } from '@/components/session-shell';
import { useUnsavedGuard } from '@/hooks/use-unsaved-guard';

type Row = { key: number; exerciseId?: number; exerciseName: string };
export type WorkoutDraftSeed = { name: string; exercises: { exerciseId?: number; exerciseName: string }[] };

type Props = {
  mode: 'create' | 'edit';
  seed: WorkoutDraftSeed;
  heading: string;
  eyebrow: string;
  cancelTo: string;
  onSubmit: (input: WorkoutInput) => Promise<WorkoutDetail | null>;
  /** Edit only: called after user confirms discarding the draft to load latest. */
  onReloadLatest?: () => void;
  reloading?: boolean;
};

let keySeq = 1;
const nextKey = () => keySeq++;
const snap = (name: string, rows: Row[]) => JSON.stringify([name, rows.map((r) => [r.exerciseId ?? null, r.exerciseName])]);
const inputCls = 'h-14 w-full rounded-2xl border border-border bg-card px-4 text-base outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/30 aria-[invalid=true]:border-destructive';

function validate(name: string, rows: Row[]) {
  const e: Record<string, string> = {};
  const n = name.trim();
  if (!n) e.name = 'Give the workout a name.';
  else if (n.length > 120) e.name = 'Keep the name to 120 characters.';
  if (rows.length === 0) e.exercises = 'Add at least one exercise.';
  if (rows.length > 50) e.exercises = 'A workout holds at most 50 exercises.';
  rows.forEach((r, i) => {
    const t = r.exerciseName.trim();
    if (!t) e[`ex-${i}`] = 'Name this exercise or remove the row.';
    else if (t.length > 120) e[`ex-${i}`] = 'Keep exercise names to 120 characters.';
  });
  return e;
}

export function WorkoutForm({ mode, seed, heading, eyebrow, cancelTo, onSubmit, onReloadLatest, reloading }: Props) {
  const initialRows = useMemo<Row[]>(
    () => (seed.exercises.length ? seed.exercises : [{ exerciseName: '' }]).map((x) => ({ key: nextKey(), exerciseId: x.exerciseId, exerciseName: x.exerciseName })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const baseline = useRef(snap(seed.name, initialRows));
  const [name, setName] = useState(seed.name);
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [reloadAsk, setReloadAsk] = useState(false);
  const [focusReq, setFocusReq] = useState(0);
  const savingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  const lib = useListExercises({ query: { queryKey: getListExercisesQueryKey(), refetchOnMount: 'always', refetchOnWindowFocus: false } });
  const library = lib.data ?? [];

  const dirty = snap(name, rows) !== baseline.current;
  const guard = useUnsavedGuard(dirty, saving);
  const errors = submitted ? validate(name, rows) : {};

  useEffect(() => {
    if (!focusReq) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusReq]);

  const setRowName = (key: number, value: string) => {
    const match = library.find((x) => x.name.toLowerCase() === value.trim().toLowerCase());
    // A typed name that is not an active library entry must drop any previous id.
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, exerciseName: value, exerciseId: match?.id } : r)));
  };
  const move = (i: number, d: -1 | 1) => setRows((rs) => {
    const j = i + d;
    if (j < 0 || j >= rs.length) return rs;
    const c = rs.slice();
    [c[i], c[j]] = [c[j], c[i]];
    return c;
  });
  const remove = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key));
  const add = () => {
    setRows((rs) => [...rs, { key: nextKey(), exerciseName: '' }]);
    setTimeout(() => {
      const inputs = formRef.current?.querySelectorAll<HTMLInputElement>('[data-exercise-input]');
      inputs?.[inputs.length - 1]?.focus();
    }, 0);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (savingRef.current || lib.isPending || lib.isError) return;
    setSubmitted(true);
    const errs = validate(name, rows);
    if (Object.keys(errs).length) { setFocusReq((n) => n + 1); return; }
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    setConflict(null);
    try {
      const saved = await onSubmit({
        name: name.trim(),
        exercises: rows.map((r) => (r.exerciseId ? { exerciseId: r.exerciseId, exerciseName: r.exerciseName.trim() } : { exerciseName: r.exerciseName.trim() })),
      });
      if (!saved) return; // account changed mid-request; nothing to show
      baseline.current = snap(name, rows);
      guard.go(`/workouts/${saved.id}`);
    } catch (err) {
      if (errorStatus(err) === 409) setConflict(errorMessage(err));
      else setSaveError(errorMessage(err));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <PageFrame onNavigate={guard.leave} busy={saving} confirmLogout={() => { if (dirty && !window.confirm('Discard unsaved workout edits and log out?')) return false; guard.release(); return true; }}>
      <p className="rise font-mono text-xs uppercase tracking-[0.3em] text-primary">{eyebrow}</p>
      <h1 className="rise mt-3 break-words text-4xl font-black uppercase leading-[0.9] md:text-6xl" style={{ animationDelay: '60ms' }}>{heading}</h1>
      {mode === 'edit' && (
        <p className="mt-4 max-w-xl text-muted-foreground">Saving writes a new numbered version. Earlier versions, and every session started from them, stay exactly as they were.</p>
      )}

      <form ref={formRef} onSubmit={submit} noValidate aria-busy={saving} className="mt-8 space-y-8" data-testid={`form-workout-${mode}`}>
        <div>
          <label htmlFor="workout-name" className="mb-2 block text-sm font-bold">Workout name</label>
          <input id="workout-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Upper A" className={inputCls}
            aria-invalid={!!errors.name} aria-describedby={errors.name ? 'workout-name-err' : undefined} disabled={saving} data-testid="input-workout-template-name" />
          {errors.name && <p id="workout-name-err" className="mt-2 text-sm text-destructive" data-testid="error-workout-name">{errors.name}</p>}
        </div>

        {lib.isPending && <p role="status" className="text-sm text-muted-foreground">Loading your exercise library…</p>}
        {lib.isError && (
          <div role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm" data-testid="status-exercise-library-error">
            <p>Your exercise library did not load. Your draft is kept; reload the library before saving.</p>
            <button type="button" disabled={lib.isFetching} onClick={() => lib.refetch()} className="mt-2 min-h-11 font-bold text-primary" data-testid="button-retry-exercise-library">Retry loading exercises</button>
          </div>
        )}
        <fieldset disabled={saving || lib.isPending || lib.isError}>
          <legend className="mb-1 flex w-full items-baseline justify-between text-sm font-bold">
            <span>Exercises, in order</span>
            <span className="font-mono text-xs text-muted-foreground" data-testid="text-exercise-count">{rows.length}/50</span>
          </legend>
          <p className="mb-4 text-sm text-muted-foreground">Pick from your library or type a new name. Sets and reps are logged later, per session.</p>
          <datalist id="exercise-library">
            {library.map((x) => <option key={x.id} value={x.name} />)}
          </datalist>
          <ol className="space-y-3">
            {rows.map((r, i) => {
              const err = errors[`ex-${i}`];
              return (
                <li key={r.key} className="flex items-start gap-2 rounded-2xl border border-border bg-card/60 p-3" data-testid={`row-workout-exercise-${i}`}>
                  <span className="mt-4 w-7 shrink-0 text-right font-mono text-sm font-bold text-primary">{String(i + 1).padStart(2, '0')}</span>
                  <div className="min-w-0 flex-1">
                    <label htmlFor={`wx-${r.key}`} className="sr-only">Exercise {i + 1}</label>
                    <input id={`wx-${r.key}`} list="exercise-library" data-exercise-input value={r.exerciseName} maxLength={120} disabled={saving}
                      onChange={(e) => setRowName(r.key, e.target.value)} placeholder="Barbell row" className={`${inputCls} h-12`}
                      aria-invalid={!!err} aria-describedby={err ? `wx-${r.key}-err` : undefined} data-testid={`input-workout-exercise-${i}`} />
                    <p className="mt-1 text-xs text-muted-foreground" data-testid={`text-exercise-source-${i}`}>{r.exerciseId ? 'From your library' : r.exerciseName.trim() ? 'New exercise, added on save' : ''}</p>
                    {err && <p id={`wx-${r.key}-err`} className="mt-1 text-sm text-destructive" data-testid={`error-workout-exercise-${i}`}>{err}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => move(i, -1)} disabled={saving || i === 0} aria-label={`Move exercise ${i + 1} up`} className="grid h-12 w-10 place-items-center rounded-xl border border-border hover:border-primary/60 disabled:opacity-30" data-testid={`button-move-up-${i}`}><ArrowUp className="h-4 w-4" /></button>
                    <button type="button" onClick={() => move(i, 1)} disabled={saving || i === rows.length - 1} aria-label={`Move exercise ${i + 1} down`} className="grid h-12 w-10 place-items-center rounded-xl border border-border hover:border-primary/60 disabled:opacity-30" data-testid={`button-move-down-${i}`}><ArrowDown className="h-4 w-4" /></button>
                    <button type="button" onClick={() => remove(r.key)} disabled={saving} aria-label={`Remove exercise ${i + 1}`} className="grid h-12 w-10 place-items-center rounded-xl border border-border hover:border-destructive/60 hover:text-destructive disabled:opacity-30" data-testid={`button-remove-exercise-${i}`}><X className="h-4 w-4" /></button>
                  </div>
                </li>
              );
            })}
          </ol>
          {rows.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center text-muted-foreground" data-testid="status-no-exercises">No exercises yet. A workout needs at least one.</div>
          )}
          {errors.exercises && <p className="mt-2 text-sm text-destructive" role="alert" data-testid="error-workout-exercises" tabIndex={-1} aria-invalid="true">{errors.exercises}</p>}
          <button type="button" onClick={add} disabled={saving || rows.length >= 50} className="mt-4 inline-flex h-12 items-center gap-2 rounded-xl border border-dashed border-primary/50 px-4 font-semibold text-primary hover:bg-primary/10 disabled:opacity-50" data-testid="button-add-workout-exercise">
            <Plus className="h-4 w-4" /> Add exercise
          </button>
        </fieldset>

        {saveError && (
          <div role="alert" className="rounded-2xl border border-destructive/50 bg-destructive/10 p-4 text-sm" data-testid="text-workout-save-error">
            <p className="font-bold text-destructive">Not saved.</p>
            <p className="mt-1">{saveError} Your edits are still here; try again.</p>
          </div>
        )}
        {conflict && (
          <div role="alert" className="rounded-2xl border border-primary/50 bg-primary/10 p-4 text-sm" data-testid="status-workout-conflict">
            <p className="font-bold text-primary">This workout changed elsewhere, or was archived.</p>
            <p className="mt-1">{conflict} Nothing was overwritten and your draft is kept below. Load the latest version to continue from it.</p>
            {onReloadLatest && (
              <button type="button" onClick={() => setReloadAsk(true)} disabled={reloading} className="mt-3 inline-flex h-11 items-center rounded-xl bg-primary px-4 font-bold text-primary-foreground disabled:opacity-60" data-testid="button-reload-latest">
                {reloading ? 'Loading latest' : 'Load latest version'}
              </button>
            )}
          </div>
        )}

        <div className="sticky bottom-0 -mx-5 flex gap-3 border-t border-border bg-background/95 px-5 py-4 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:px-0">
          <button type="button" onClick={() => guard.leave(cancelTo)} disabled={saving} className="h-14 flex-1 rounded-2xl border border-border bg-card font-semibold hover:bg-secondary disabled:opacity-60 md:flex-none md:px-8" data-testid="button-cancel-workout">Cancel</button>
          <button type="submit" disabled={saving || lib.isPending || lib.isError} className="h-14 flex-[2] rounded-2xl bg-primary font-bold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60 md:flex-none md:px-10" data-testid="button-save-workout">
            {saving ? 'Saving' : mode === 'create' ? 'Save workout' : 'Save new version'}
          </button>
        </div>
      </form>

      <ConfirmDialog open={guard.discardOpen} title="Discard changes?" description="Your unsaved workout edits will be lost." confirmLabel="Discard" cancelLabel="Keep editing" onConfirm={guard.confirmDiscard} onCancel={guard.cancelDiscard} testid="discard" />
      <ConfirmDialog open={reloadAsk} title="Load latest?" description="This replaces your unsaved draft with the newest saved version." confirmLabel="Discard draft and load" cancelLabel="Keep my draft"
        onConfirm={() => { setReloadAsk(false); guard.release(); onReloadLatest?.(); }} onCancel={() => setReloadAsk(false)} testid="reload-latest" />
    </PageFrame>
  );
}
