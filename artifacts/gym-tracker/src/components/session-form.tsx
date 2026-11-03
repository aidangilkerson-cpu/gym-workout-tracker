import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { SessionInput, WorkoutSessionRecord } from '@workspace/api-client-react';
import { Plus, Trash2 } from 'lucide-react';
import { useUnsavedGuard } from '@/hooks/use-unsaved-guard';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { WeightInput } from '@/components/weight-input';
import { PageFrame, errorMessage, errorStatus } from '@/components/session-shell';
import { validateSessionDraft, sessionErrorsFromResponse, type FieldErrors } from '@/lib/session-validation';

type ExerciseDraft = {
  key: number;
  exerciseId?: number;
  exerciseName: string;
  weightLb: string;
  setCount: string;
  reps: string;
  /** Original reps array, kept verbatim unless the user edits sets/reps. */
  originalReps: number[] | null;
  setsTouched: boolean;
};

type Draft = { workoutName: string; date: string; notes: string; exercises: ExerciseDraft[] };

let keySeq = 1;

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function blankExercise(): ExerciseDraft {
  return { key: keySeq++, exerciseName: '', weightLb: '', setCount: '3', reps: '', originalReps: null, setsTouched: true };
}

function fromRecord(r: WorkoutSessionRecord): Draft {
  return {
    workoutName: r.workoutName,
    date: r.date,
    notes: r.notes ?? '',
    exercises: [...r.exercises].sort((a, b) => a.position - b.position).map((ex) => {
      const reps = [...ex.sets].sort((a, b) => a.setNumber - b.setNumber).map((s) => s.reps);
      const uniform = reps.length > 0 && reps.every((x) => x === reps[0]);
      return {
        key: keySeq++,
        exerciseId: ex.exerciseId,
        exerciseName: ex.exerciseName,
        weightLb: String(ex.weightLb),
        setCount: String(reps.length),
        reps: uniform ? String(reps[0]) : '',
        originalReps: reps,
        setsTouched: false,
      };
    }),
  };
}

function snapshot(d: Draft) {
  return JSON.stringify({ ...d, exercises: d.exercises.map(({ key: _k, ...rest }) => rest) });
}

function toInput(d: Draft): SessionInput {
  return {
    workoutName: d.workoutName.trim(),
    date: d.date,
    notes: d.notes.trim() ? d.notes : null,
    exercises: d.exercises.map((ex) => {
      const sets = !ex.setsTouched && ex.originalReps
        ? ex.originalReps.map((reps) => ({ reps }))
        : Array.from({ length: Number(ex.setCount) }, () => ({ reps: Number(ex.reps) }));
      return {
        ...(ex.exerciseId ? { exerciseId: ex.exerciseId } : {}),
        exerciseName: ex.exerciseName.trim(),
        weightLb: Number(ex.weightLb),
        sets,
      };
    }),
  };
}

const inputCls = 'h-12 w-full rounded-xl border border-input bg-secondary px-3.5 text-base text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:opacity-60 aria-invalid:border-destructive aria-invalid:focus:border-destructive aria-invalid:focus:ring-destructive/25';
const labelCls = 'mb-1.5 block font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground';

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p id={id} className="mt-1.5 text-sm text-destructive" data-testid={id}>{message}</p> : null;
}

type Props = {
  mode: 'create' | 'edit';
  initial?: WorkoutSessionRecord;
  cancelTo: string;
  onSubmit: (input: SessionInput) => Promise<WorkoutSessionRecord>;
};

export function SessionForm({ mode, initial, cancelTo, onSubmit }: Props) {
  const initialDraft = useMemo<Draft>(
    () => (initial ? fromRecord(initial) : { workoutName: '', date: today(), notes: '', exercises: [blankExercise()] }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const baseline = useRef(snapshot(initialDraft));
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [focusRequest, setFocusRequest] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const errors = { ...(submitted ? validateSessionDraft(draft) : {}), ...serverErrors };
  const hasErrors = Object.keys(errors).length > 0;
  const fieldProps = (path: string, id: string) => ({
    'aria-invalid': Boolean(errors[path]),
    'aria-describedby': errors[path] ? `${id}-error` : undefined,
  });
  useEffect(() => {
    if (!focusRequest) return;
    const form = formRef.current;
    const target = form?.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?? form?.querySelector<HTMLElement>('[data-testid="validation-summary"]');
    target?.focus();
  }, [focusRequest]);
  const dirty = snapshot(draft) !== baseline.current;
  const guard = useUnsavedGuard(dirty, saving);
  const confirmLogout = () => {
    if (!dirty) return true;
    const ok = window.confirm('You have unsaved changes to this session. Log out and discard them?');
    if (ok) guard.release();
    return ok;
  };

  const changeDraft = (update: (draft: Draft) => Draft) => {
    setDraft(update);
    setServerErrors({});
    setSaveError(null);
  };
  const patch = (p: Partial<Draft>) => changeDraft((d) => ({ ...d, ...p }));
  const patchEx = (key: number, p: Partial<ExerciseDraft>) =>
    changeDraft((d) => ({ ...d, exercises: d.exercises.map((ex) => (ex.key === key ? { ...ex, ...p } : ex)) }));

  const touchSets = (ex: ExerciseDraft, p: Partial<ExerciseDraft>) => patchEx(ex.key, { ...p, setsTouched: true });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSubmitted(true);
    setSaveError(null);
    setServerErrors({});
    if (Object.keys(validateSessionDraft(draft)).length) {
      setFocusRequest((request) => request + 1);
      return;
    }
    setSaving(true);
    try {
      const saved = await onSubmit(toInput(draft));
      baseline.current = snapshot(draft);
      guard.go(`/sessions/${saved.id}`);
    } catch (err) {
      setSaving(false);
      const fields = sessionErrorsFromResponse(err, draft.exercises.length);
      setServerErrors(fields);
      if (Object.keys(fields).length) {
        setFocusRequest((request) => request + 1);
      } else {
        const status = errorStatus(err);
        setSaveError(status === undefined
          ? "We couldn't reach the server. Check your connection and try saving again."
          : status >= 500 ? "We couldn't save your session right now. Please try again."
          : errorMessage(err));
      }
    }
  };

  return (
    <PageFrame onNavigate={guard.leave} busy={saving} confirmLogout={confirmLogout}>
      <p className="rise font-mono text-xs uppercase tracking-[0.3em] text-primary">{mode === 'create' ? 'New entry' : 'Editing entry'}</p>
      <h1 className="rise mt-3 text-4xl font-black uppercase leading-[0.9] md:text-6xl" style={{ animationDelay: '60ms' }}>
        {mode === 'create' ? 'Log a session.' : 'Fix the record.'}
      </h1>

      <form ref={formRef} noValidate onSubmit={handleSubmit} className="rise mt-8 space-y-6" style={{ animationDelay: '120ms' }} data-testid="form-session" aria-busy={saving}>
        {hasErrors && (
          <div role="alert" tabIndex={-1} className="rounded-2xl border border-destructive/50 bg-destructive/10 p-4 text-sm" data-testid="validation-summary">
            <p className="font-bold text-destructive">Check the highlighted fields.</p>
            <p className="mt-1">Your changes haven&apos;t been saved. Your entries are still here.</p>
            {errors.session && <p className="mt-1">{errors.session}</p>}
          </div>
        )}
        <fieldset disabled={saving} className="space-y-6">
          <section className="grid gap-4 rounded-3xl border border-border bg-card p-5 md:grid-cols-[1fr_190px] md:p-7">
            <div>
              <label htmlFor="workoutName" className={labelCls}>Workout name</label>
              <input id="workoutName" required maxLength={120} value={draft.workoutName} onChange={(e) => patch({ workoutName: e.target.value })} placeholder="Push day A" className={inputCls} data-testid="input-workout-name" {...fieldProps('workoutName', 'workoutName')} />
              <FieldError id="workoutName-error" message={errors.workoutName} />
            </div>
            <div>
              <label htmlFor="date" className={labelCls}>Date</label>
              <input id="date" type="date" required min="0001-01-01" max="9999-12-31" value={draft.date} onChange={(e) => patch({ date: e.target.value })} className={inputCls} data-testid="input-date" {...fieldProps('date', 'date')} />
              <FieldError id="date-error" message={errors.date} />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="notes" className={labelCls}>Notes (optional)</label>
              <textarea id="notes" maxLength={5000} rows={3} value={draft.notes} onChange={(e) => patch({ notes: e.target.value })} placeholder="Left shoulder felt tight on the last set." className={`${inputCls} h-auto py-3`} data-testid="input-notes" {...fieldProps('notes', 'notes')} />
              <FieldError id="notes-error" message={errors.notes} />
            </div>
          </section>

          <div className="flex items-end justify-between">
            <h2 className="text-xl font-black uppercase tracking-tight">Exercises <span className="font-mono text-sm text-muted-foreground">{draft.exercises.length}</span></h2>
          </div>
          <FieldError id="exercises-error" message={errors.exercises} />

          <ol className="space-y-4">
            {draft.exercises.map((ex, i) => {
              const mixed = !ex.setsTouched && !!ex.originalReps && ex.reps === '';
              const id = `ex-${ex.key}`;
              const path = `exercises.${i}`;
              return (
                <li key={ex.key} className="relative rounded-3xl border border-border bg-card p-5 md:p-6" data-testid={`card-exercise-input-${i}`}>
                  <div className="mb-4 flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-primary">{String(i + 1).padStart(2, '0')}</span>
                    <button
                      type="button"
                      onClick={() => changeDraft((d) => ({ ...d, exercises: d.exercises.filter((x) => x.key !== ex.key) }))}
                      disabled={draft.exercises.length <= 1}
                      aria-label={`Remove exercise ${i + 1}`}
                      className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-muted-foreground hover:text-destructive disabled:opacity-30"
                      data-testid={`button-remove-exercise-${i}`}
                    >
                      <Trash2 className="h-4 w-4" /> Remove
                    </button>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-[2fr_1fr_1fr_1fr]">
                    <div className="sm:col-span-2 md:col-span-1">
                      <label htmlFor={`${id}-name`} className={labelCls}>Exercise</label>
                      <input
                        id={`${id}-name`}
                        required
                        maxLength={120}
                        value={ex.exerciseName}
                        onChange={(e) => patchEx(ex.key, { exerciseName: e.target.value, exerciseId: undefined })}
                        placeholder="Bench press"
                        className={inputCls}
                        data-testid={`input-exercise-name-${i}`}
                        {...fieldProps(`${path}.exerciseName`, `${id}-name`)}
                      />
                      <FieldError id={`${id}-name-error`} message={errors[`${path}.exerciseName`]} />
                    </div>
                    <div>
                      <label htmlFor={`${id}-weight`} className={labelCls}>Weight (lb)</label>
                      <WeightInput id={`${id}-weight`} value={ex.weightLb} onValueChange={(value) => patchEx(ex.key, { weightLb: value })} className={inputCls} testId={`input-weight-${i}`} invalid={Boolean(errors[`${path}.weightLb`])} describedBy={errors[`${path}.weightLb`] ? `${id}-weight-error` : undefined} />
                      <FieldError id={`${id}-weight-error`} message={errors[`${path}.weightLb`]} />
                    </div>
                    <div>
                      <label htmlFor={`${id}-sets`} className={labelCls}>Sets</label>
                      <input id={`${id}-sets`} type="number" inputMode="numeric" required min={1} max={100} step={1} value={ex.setCount} onChange={(e) => touchSets(ex, { setCount: e.target.value })} className={inputCls} data-testid={`input-sets-${i}`} {...fieldProps(`${path}.sets`, `${id}-sets`)} />
                      <FieldError id={`${id}-sets-error`} message={errors[`${path}.sets`]} />
                    </div>
                    <div>
                      <label htmlFor={`${id}-reps`} className={labelCls}>Reps per set</label>
                      <input id={`${id}-reps`} type="number" inputMode="numeric" required={!mixed} min={0} max={2147483647} step={1} value={ex.reps} onChange={(e) => touchSets(ex, { reps: e.target.value })} placeholder={mixed ? 'Varies' : '8'} className={inputCls} data-testid={`input-reps-${i}`} {...fieldProps(`${path}.reps`, `${id}-reps`)} />
                      <FieldError id={`${id}-reps-error`} message={errors[`${path}.reps`]} />
                    </div>
                  </div>
                  {mixed && ex.originalReps && (
                    <p className="mt-3 font-mono text-xs text-muted-foreground" data-testid={`text-mixed-reps-${i}`}>
                      Saved reps vary by set ({ex.originalReps.join(' / ')}). They stay as-is unless you change sets or reps.
                    </p>
                  )}
                </li>
              );
            })}
          </ol>

          <button
            type="button"
            onClick={() => changeDraft((d) => ({ ...d, exercises: [...d.exercises, blankExercise()] }))}
            disabled={draft.exercises.length >= 50}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border font-bold text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-40"
            data-testid="button-add-exercise"
            {...fieldProps('exercises', 'exercises')}
          >
            <Plus className="h-5 w-5" /> Add exercise
          </button>
        </fieldset>

        {saveError && (
          <div role="alert" className="rounded-2xl border border-destructive/50 bg-destructive/10 p-4 text-sm" data-testid="text-save-error">
            <p className="font-bold text-destructive">Not saved.</p>
            <p className="mt-1 text-foreground/90">{saveError} Your entries are still here; try again.</p>
          </div>
        )}

        <div className="sticky bottom-0 -mx-5 flex gap-3 border-t border-border bg-background/95 px-5 py-4 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:px-0">
          <button
            type="button"
            onClick={() => guard.leave(cancelTo)}
            disabled={saving}
            className="h-14 flex-1 rounded-2xl border border-border bg-card font-semibold hover:bg-secondary disabled:opacity-60 md:flex-none md:px-8"
            data-testid="button-cancel"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="h-14 flex-[2] rounded-2xl bg-primary font-bold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60 md:flex-none md:px-10"
            data-testid="button-save-session"
          >
            {saving ? 'Saving' : mode === 'create' ? 'Save session' : 'Save changes'}
          </button>
        </div>
      </form>

      <ConfirmDialog
        open={guard.discardOpen}
        title="Discard changes?"
        description="You have unsaved edits to this session. Leaving now throws them away."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onConfirm={guard.confirmDiscard}
        onCancel={guard.cancelDiscard}
        testid="discard"
      />
    </PageFrame>
  );
}
