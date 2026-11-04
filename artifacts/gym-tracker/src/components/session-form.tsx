import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '@clerk/react';
import { useLocation, useSearch } from 'wouter';
import type { SessionInput, WorkoutSessionRecord, WorkoutVersionRecord } from '@workspace/api-client-react';
import { Plus, Trash2 } from 'lucide-react';
import { useUnsavedGuard } from '@/hooks/use-unsaved-guard';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { WeightInput } from '@/components/weight-input';
import { PageFrame, errorMessage, errorStatus, formatDate } from '@/components/session-shell';
import { SetEditor, refBadgeCls } from '@/components/set-editor';
import type { SessionSeed } from '@/lib/session-seed';
import { blankExercise, createSessionDraft, draftFromRecord, draftSnapshot, draftToInput, appendDraftSet, removeDraftSet, updateDraftSet, reserveDraftKeys, MAX_SETS, type SessionDraft as Draft, type ExerciseDraft } from '@/lib/session-draft';
import { recoveryKey, readCheckpoint, writeCheckpoint, clearCheckpoint, type SessionCheckpoint } from '@/lib/session-recovery';
import { validateSessionDraft, sessionErrorsFromResponse, type FieldErrors } from '@/lib/session-validation';
import { latestExerciseNotes, withPreviousNote, exerciseIdForName } from '@/lib/exercise-notes';

const inputCls = 'h-12 w-full rounded-xl border border-input bg-secondary px-3.5 text-base text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:opacity-60 aria-invalid:border-destructive aria-invalid:focus:border-destructive aria-invalid:focus:ring-destructive/25';
const labelCls = 'mb-1.5 block font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground';

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p id={id} className="mt-1.5 text-sm text-destructive" data-testid={id}>{message}</p> : null;
}

type Props = {
  mode: 'create' | 'edit';
  initial?: WorkoutSessionRecord;
  templateVersion?: WorkoutVersionRecord;
  /** Create-only prefill (repeat or last-time). Pinned on first render. */
  seed?: SessionSeed;
  noteHistory?: WorkoutSessionRecord[];
  exerciseLibrary?: { id: number; name: string }[];
  cancelTo: string;
  onSubmit: (input: SessionInput) => Promise<WorkoutSessionRecord>;
};

export function SessionForm({ mode, initial, templateVersion, seed, noteHistory = [], exerciseLibrary = [], cancelTo, onSubmit }: Props) {
  const { userId, sessionId } = useAuth();
  const [location] = useLocation();
  const search = useSearch();
  // AccountGate has already confirmed identity before this form may mount.
  const checkpointId = recoveryKey(userId!, sessionId!, `${mode}:${location}?${new URLSearchParams(search).toString()}`);
  const recovered = useRef(readCheckpoint(checkpointId)).current;
  const previousNotes = useRef(latestExerciseNotes(noteHistory)).current;
  const library = useRef(exerciseLibrary).current;
  // Keep provenance and the seed together, even if a parent query refreshes.
  const pinnedTemplate = useRef(recovered ? recovered.template : templateVersion).current;
  const pinnedSeed = useRef(mode === 'create' ? seed : undefined).current;
  const reference = recovered ? recovered.reference : pinnedSeed?.reference;
  const refLabel = reference?.kind === 'repeat' ? 'Copied' : 'Last time';
  const refDate = reference ? formatDate(reference.date) : '';
  const sourceVersionId = recovered ? recovered.sourceVersionId : pinnedSeed && pinnedSeed.workoutVersionId !== undefined ? pinnedSeed.workoutVersionId : pinnedTemplate?.id;
  // Touched tracking by local keys (not value comparison); kept out of the payload/dirty snapshot.
  const [touched, setTouched] = useState<{ weight: Set<number>; reps: Set<number>; count: Set<number> }>(() => ({
    weight: new Set(recovered?.touched.weight), reps: new Set(recovered?.touched.reps), count: new Set(recovered?.touched.count),
  }));
  const touch = (kind: 'weight' | 'reps' | 'count', key: number) => setTouched((t) => {
    if (t[kind].has(key)) return t;
    const next = new Set(t[kind]); next.add(key);
    return { ...t, [kind]: next };
  });
  const touchExercise = (exercise: ExerciseDraft) => setTouched(t => ({
    weight: new Set(t.weight).add(exercise.key),
    count: new Set(t.count).add(exercise.key),
    reps: new Set([...t.reps, ...exercise.sets.map(set => set.key)]),
  }));
  const initialDraft = useMemo<Draft>(
    () => {
      if (recovered) {
        reserveDraftKeys(recovered.draft);
        return recovered.draft;
      }
      const draft = initial ? draftFromRecord(initial) : pinnedSeed?.draft ?? createSessionDraft(pinnedTemplate);
      return mode === 'edit' ? draft : { ...draft, exercises: draft.exercises.map(ex => withPreviousNote(ex, previousNotes)) };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const baseline = useRef(recovered?.baseline ?? draftSnapshot(initialDraft));
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [focusRequest, setFocusRequest] = useState(0);
  const [recoveryAvailable, setRecoveryAvailable] = useState(true);
  const recoveryActive = useRef(true);
  const checkpoint = useRef<SessionCheckpoint>(null!);
  checkpoint.current = {
    version: 1, draft, baseline: baseline.current, template: pinnedTemplate, sourceVersionId, reference,
    touched: { weight: [...touched.weight], reps: [...touched.reps], count: [...touched.count] },
  };
  const forgetDraft = () => { recoveryActive.current = false; clearCheckpoint(checkpointId); };
  useEffect(() => {
    if (recoveryActive.current) setRecoveryAvailable(writeCheckpoint(checkpointId, checkpoint.current));
  }, [checkpointId, draft, touched]);
  useEffect(() => {
    const flush = () => {
      if (recoveryActive.current) writeCheckpoint(checkpointId, checkpoint.current);
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, [checkpointId]);
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
  const dirty = draftSnapshot(draft) !== baseline.current;
  const guard = useUnsavedGuard(dirty, saving);
  const leave = (to: string) => {
    if (!dirty && !saving) forgetDraft();
    guard.leave(to);
  };
  const confirmLogout = () => {
    if (!dirty) { forgetDraft(); return true; }
    const ok = window.confirm('You have unsaved changes to this session. Log out and discard them?');
    if (ok) { forgetDraft(); guard.release(); }
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

  const mapEx = (key: number, fn: (ex: ExerciseDraft) => ExerciseDraft) =>
    changeDraft((d) => ({ ...d, exercises: d.exercises.map((ex) => (ex.key === key ? fn(ex) : ex)) }));
  const submitting = useRef(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving || submitting.current) return;
    setSubmitted(true);
    setSaveError(null);
    setServerErrors({});
    if (Object.keys(validateSessionDraft(draft)).length) {
      setFocusRequest((request) => request + 1);
      return;
    }
    submitting.current = true;
    setSaving(true);
    try {
      const saved = await onSubmit({
        ...draftToInput(draft),
        ...(mode === 'create' && sourceVersionId !== undefined ? { workoutVersionId: sourceVersionId } : {}),
      });
      baseline.current = draftSnapshot(draft);
      forgetDraft();
      guard.go(`/sessions/${saved.id}`);
    } catch (err) {
      submitting.current = false;
      setSaving(false);
      const fields = sessionErrorsFromResponse(err, draft.exercises.map((ex) => ex.sets.length));
      setServerErrors(fields);
      if (Object.keys(fields).length) {
        setFocusRequest((request) => request + 1);
      } else {
        const status = errorStatus(err);
        setSaveError(status === 409 && mode === 'create' && sourceVersionId != null
          ? `${errorMessage(err)} The source workout may be archived: restore it from Workouts, then save again. This draft stays linked to it.`
          : status === undefined
          ? "We couldn't reach the server. Check your connection and try saving again."
          : status >= 500 ? "We couldn't save your session right now. Please try again."
          : errorMessage(err));
      }
    }
  };

  return (
    <PageFrame onNavigate={leave} busy={saving} confirmLogout={confirmLogout}>
      <p className="rise font-mono text-xs uppercase tracking-[0.3em] text-primary">{mode === 'create' ? 'New entry' : 'Editing entry'}</p>
      <h1 className="rise mt-3 text-4xl font-black uppercase leading-[0.9] md:text-6xl" style={{ animationDelay: '60ms' }}>
        {mode === 'create' ? 'Log a session.' : 'Fix the record.'}
      </h1>
      {recovered && <p className="mt-4 text-sm text-primary" role="status" data-testid="status-draft-restored">Your in-progress workout was restored. Nothing new has been logged until you save.</p>}
      {!recoveryAvailable && <p className="mt-4 text-sm text-destructive" role="alert" data-testid="status-draft-storage-error">This browser cannot keep a reload recovery copy. Your entries are retained during account retry, but keep this tab open until you save.</p>}
      {reference && (
        <div className="mt-4 rounded-xl border border-primary/40 bg-primary/5 p-4 text-sm" data-testid="text-session-reference">
          {reference.kind === 'repeat' ? (
            <p><span className="font-bold text-foreground">Repeating {refDate}.</span> <span className="text-muted-foreground">The new date defaults to today; the original stays unchanged. Copied numbers are suggestions and nothing is logged until you save.</span></p>
          ) : (
            <p><span className="font-bold text-foreground">Prefilled from last time, {refDate}.</span> <span className="text-muted-foreground">Numbers are suggestions from that session; nothing is logged until you save.</span></p>
          )}
        </div>
      )}
      {pinnedTemplate && (
        <p className="mt-4 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground" data-testid="text-session-template-version">
          From {pinnedTemplate.workoutName}, version {pinnedTemplate.versionNumber}.
          This draft keeps that version even if the workout changes. Nothing is logged until you save.
        </p>
      )}

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
                  <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-[2fr_1fr]">
                    <div className="sm:col-span-2 md:col-span-1">
                      <label htmlFor={`${id}-name`} className={labelCls}>Exercise</label>
                      <input
                        id={`${id}-name`}
                        required
                        maxLength={120}
                        value={ex.exerciseName}
                        list="session-exercise-library"
                        onChange={(e) => {
                          touchExercise(ex);
                          const exerciseName = e.target.value;
                          const exerciseId = exerciseIdForName(exerciseName, library);
                          mapEx(ex.key, old => {
                            const updated = { ...old, exerciseName, exerciseId };
                            return mode === 'create' ? withPreviousNote(updated, previousNotes) : updated;
                          });
                        }}
                        placeholder="Bench press"
                        className={inputCls}
                        data-testid={`input-exercise-name-${i}`}
                        {...fieldProps(`${path}.exerciseName`, `${id}-name`)}
                      />
                      <FieldError id={`${id}-name-error`} message={errors[`${path}.exerciseName`]} />
                    </div>
                    <div>
                      <label htmlFor={`${id}-weight`} className={labelCls}>Weight (lb, all sets)</label>
                      <WeightInput id={`${id}-weight`} value={ex.weightLb} onValueChange={(value) => { touch('weight', ex.key); patchEx(ex.key, { weightLb: value }); }} className={inputCls} testId={`input-weight-${i}`} invalid={Boolean(errors[`${path}.weightLb`])} describedBy={[
                        errors[`${path}.weightLb`] ? `${id}-weight-error` : null,
                        reference?.exercisesByKey[ex.key] && !touched.weight.has(ex.key) ? `${id}-weight-ref` : null,
                      ].filter(Boolean).join(' ') || undefined} />
                      {reference?.exercisesByKey[ex.key] && !touched.weight.has(ex.key) && (
                        <p className="mt-1.5"><span id={`${id}-weight-ref`} className={refBadgeCls} data-testid={`text-last-weight-${i}`}>{refLabel} {refDate}: {reference.exercisesByKey[ex.key].weightLb} lb</span></p>
                      )}
                      <FieldError id={`${id}-weight-error`} message={errors[`${path}.weightLb`]} />
                    </div>
                  </div>
                  <div className="mt-4">
                    <label htmlFor={`${id}-notes`} className={labelCls}>Exercise note (optional)</label>
                    <textarea
                      id={`${id}-notes`}
                      rows={2}
                      maxLength={5000}
                      value={ex.notes}
                      onChange={e => patchEx(ex.key, { notes: e.target.value, noteSource: undefined, noteEdited: true })}
                      placeholder="Seat setting, technique cues, or what to try next time."
                      className={`${inputCls} h-auto py-3`}
                      data-testid={`input-exercise-notes-${i}`}
                      aria-invalid={Boolean(errors[`${path}.notes`])}
                      aria-describedby={[`${id}-notes-help`, errors[`${path}.notes`] ? `${id}-notes-error` : null].filter(Boolean).join(' ')}
                    />
                    <p id={`${id}-notes-help`} className="mt-1.5 text-xs text-muted-foreground" data-testid={`text-exercise-notes-source-${i}`}>
                      {ex.noteSource
                        ? `Last time · ${formatDate(ex.noteSource.date)} · ${ex.noteSource.workoutName}${ex.notes ? '' : ' · No note saved'}`
                        : mode === 'edit' ? 'Saved with this session. Other sessions keep their own notes.'
                        : 'Saved with this session and carried across your workouts for this exercise.'}
                    </p>
                    <FieldError id={`${id}-notes-error`} message={errors[`${path}.notes`]} />
                  </div>
                  <SetEditor
                    exercise={ex}
                    index={i}
                    idBase={id}
                    exerciseLabel={ex.exerciseName.trim() || `exercise ${i + 1}`}
                    errors={errors}
                    disabled={saving}
                    inputCls={inputCls}
                    onAdd={() => { if (ex.sets.length < MAX_SETS) touch('count', ex.key); mapEx(ex.key, appendDraftSet); }}
                    onRemove={(k) => { if (ex.sets.length > 1) touch('count', ex.key); mapEx(ex.key, (x) => removeDraftSet(x, k)); }}
                    onChange={(k, reps) => { touch('reps', k); mapEx(ex.key, (x) => updateDraftSet(x, k, reps)); }}
                    previous={reference?.exercisesByKey[ex.key]}
                    refLabel={refLabel}
                    refDate={refDate}
                    editedSetKeys={touched.reps}
                    countTouched={touched.count.has(ex.key)}
                  />
                </li>
              );
            })}
          </ol>
          <datalist id="session-exercise-library">
            {library.map(ex => <option key={ex.id} value={ex.name} />)}
          </datalist>

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
            onClick={() => leave(cancelTo)}
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
        onConfirm={() => { forgetDraft(); guard.confirmDiscard(); }}
        onCancel={guard.cancelDiscard}
        testid="discard"
      />
    </PageFrame>
  );
}
