import type { WorkoutSessionRecord, WorkoutVersionRecord } from '@workspace/api-client-react';
import { createSessionDraft, createSetDraft, draftFromRecord, type SessionDraft } from './session-draft.ts';

export type PreviousExercise = {
  weightLb: string;
  setCount: number;
  repsByKey: Record<number, string>;
};
export type SessionSeed = {
  draft: SessionDraft;
  workoutVersionId?: number | null;
  reference?: {
    kind: 'repeat' | 'last-time';
    sessionId: number;
    date: string;
    exercisesByKey: Record<number, PreviousExercise>;
  };
};

/** Caller supplies versions from an owned workout, not a name-based match. */
export function latestWorkoutSession(sessions: WorkoutSessionRecord[], versions: WorkoutVersionRecord[]) {
  const ids = new Set(versions.map(version => version.id));
  return sessions.filter(s => s.workoutVersionId != null && ids.has(s.workoutVersionId))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)[0];
}

function referenceExercise(exercise: SessionDraft['exercises'][number]): PreviousExercise {
  return {
    weightLb: exercise.weightLb,
    setCount: exercise.sets.length,
    repsByKey: Object.fromEntries(exercise.sets.map(set => [set.key, set.reps])),
  };
}

/** Copy results, not record IDs, the original date/notes, or its star. No write. */
export function repeatSessionSeed(record: WorkoutSessionRecord, now = new Date()): SessionSeed {
  const draft = draftFromRecord(record);
  draft.date = createSessionDraft(undefined, now).date;
  draft.notes = '';
  return {
    draft, workoutVersionId: record.workoutVersionId,
    reference: {
      kind: 'repeat', sessionId: record.id, date: record.date,
      exercisesByKey: Object.fromEntries(draft.exercises.map(ex => [ex.key, referenceExercise(ex)])),
    },
  };
}

/** Latest preset structure wins; prior results match stable ID and occurrence. */
export function templateSessionSeed(
  template: WorkoutVersionRecord, previous?: WorkoutSessionRecord, now = new Date(),
): SessionSeed {
  const draft = createSessionDraft(template, now);
  const exercisesByKey: Record<number, PreviousExercise> = {};
  const occurrences = new Map<number, WorkoutSessionRecord['exercises']>();
  for (const ex of [...(previous?.exercises ?? [])].sort((a, b) => a.position - b.position)) {
    const group = occurrences.get(ex.exerciseId) ?? [];
    group.push(ex);
    occurrences.set(ex.exerciseId, group);
  }
  for (const ex of draft.exercises) {
    const old = ex.exerciseId === undefined ? undefined : occurrences.get(ex.exerciseId)?.shift();
    if (!old) continue;
    ex.weightLb = String(old.weightLb);
    ex.sets = [...old.sets].sort((a, b) => a.setNumber - b.setNumber)
      .map(set => createSetDraft(String(set.reps)));
    exercisesByKey[ex.key] = referenceExercise(ex);
  }
  return {
    draft, workoutVersionId: template.id,
    ...(previous && Object.keys(exercisesByKey).length ? { reference: {
      kind: 'last-time' as const, sessionId: previous.id, date: previous.date, exercisesByKey,
    } } : {}),
  };
}
