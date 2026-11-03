import { useEffect, useRef } from 'react';
import { Minus, Plus } from 'lucide-react';
import { MAX_SETS, type ExerciseDraft } from '@/lib/session-draft';
import type { FieldErrors } from '@/lib/session-validation';

type Props = {
  exercise: ExerciseDraft;
  index: number;
  idBase: string;
  exerciseLabel: string;
  errors: FieldErrors;
  disabled: boolean;
  inputCls: string;
  onAdd: () => void;
  onRemove: (setKey: number) => void;
  onChange: (setKey: number, reps: string) => void;
};

export function SetEditor({ exercise, index, idBase, exerciseLabel, errors, disabled, inputCls, onAdd, onRemove, onChange }: Props) {
  const path = `exercises.${index}`;
  const count = exercise.sets.length;
  const atMax = count >= MAX_SETS;
  const focusKey = useRef<number | null>(null);
  const expected = useRef(count);
  const pendingAdd = useRef(false);

  useEffect(() => {
    if (pendingAdd.current && count > expected.current) {
      pendingAdd.current = false;
      const last = exercise.sets[count - 1];
      if (last) focusKey.current = last.key;
    }
    expected.current = count;
    if (focusKey.current !== null) {
      document.getElementById(`${idBase}-set-${focusKey.current}`)?.focus();
      focusKey.current = null;
    }
  }, [count, exercise.sets, idBase]);

  const countErr = errors[`${path}.sets`];
  const hintId = `${idBase}-sets-hint`;

  return (
    <div className="mt-5 border-t border-border pt-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Sets and reps</h3>
        <p id={hintId} className="font-mono text-xs text-muted-foreground" data-testid={`text-set-count-${index}`} aria-live="polite">
          {count} of {MAX_SETS} sets{atMax ? ' (limit reached)' : ''}
        </p>
      </div>
      <ol className="space-y-2" aria-label={`Sets for ${exerciseLabel}`}>
        {exercise.sets.map((set, j) => {
          const inputId = `${idBase}-set-${set.key}`;
          const err = errors[`${path}.sets.${j}.reps`];
          const errId = `${inputId}-error`;
          return (
            <li key={set.key} data-testid={`row-set-${index}-${j}`}>
              <div className="flex items-center gap-2">
                <label htmlFor={inputId} className="w-16 shrink-0 font-mono text-xs font-bold uppercase text-primary">
                  Set {j + 1}
                  <span className="sr-only"> reps, {exerciseLabel}</span>
                </label>
                <input
                  id={inputId}
                  type="number"
                  inputMode="numeric"
                  required
                  min={0}
                  max={2147483647}
                  step={1}
                  value={set.reps}
                  onChange={(e) => onChange(set.key, e.target.value)}
                  placeholder="Reps"
                  disabled={disabled}
                  className={`${inputCls} min-w-0 flex-1`}
                  data-testid={`input-reps-${index}-${j}`}
                  aria-invalid={Boolean(err)}
                  aria-describedby={err ? errId : undefined}
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = exercise.sets[j + 1] ?? exercise.sets[j - 1];
                    focusKey.current = next ? next.key : null;
                    onRemove(set.key);
                  }}
                  disabled={disabled || count <= 1}
                  aria-label={`Remove set ${j + 1} from ${exerciseLabel}`}
                  title={count <= 1 ? 'Each exercise needs at least one set' : undefined}
                  className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground hover:border-destructive hover:text-destructive disabled:opacity-30"
                  data-testid={`button-remove-set-${index}-${j}`}
                >
                  <Minus className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              {err && <p id={errId} className="ml-[4.5rem] mt-1 text-sm text-destructive" data-testid={`${idBase}-set-${j}-error`}>{err}</p>}
            </li>
          );
        })}
      </ol>
      {countErr && <p id={`${idBase}-sets-error`} className="mt-2 text-sm text-destructive">{countErr}</p>}
      <button
        type="button"
        onClick={() => { pendingAdd.current = true; onAdd(); }}
        disabled={disabled || atMax}
        aria-describedby={hintId}
        className="mt-3 inline-flex h-11 items-center gap-1.5 rounded-xl border border-dashed border-border px-4 text-sm font-semibold text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-40"
        data-testid={`button-add-set-${index}`}
      >
        <Plus className="h-4 w-4" aria-hidden="true" /> {atMax ? `Max ${MAX_SETS} sets` : 'Add set'}
      </button>
    </div>
  );
}
