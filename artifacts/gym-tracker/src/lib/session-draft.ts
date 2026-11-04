import type { SessionInput, WorkoutSessionRecord, WorkoutVersionRecord } from '@workspace/api-client-react';

export type SetDraft = { key: number; reps: string };
export type ExerciseDraft = {
  key: number;
  exerciseId?: number;
  exerciseName: string;
  notes: string;
  noteSource?: { date: string; workoutName: string };
  noteEdited?: boolean;
  weightLb: string;
  sets: SetDraft[];
};
export type SessionDraft = { workoutName: string; date: string; notes: string; exercises: ExerciseDraft[] };

export const MAX_SETS = 100;
let keySeq = 0;
/** Recovered local keys must not collide with newly added exercise/set rows. */
export function reserveDraftKeys(draft: SessionDraft) {
  for (const exercise of draft.exercises) {
    keySeq = Math.max(keySeq, exercise.key, ...exercise.sets.map(set => set.key));
  }
}
export const createSetDraft = (reps = ''): SetDraft => ({ key: ++keySeq, reps });
export const blankExercise = (): ExerciseDraft => ({
  key: ++keySeq, exerciseName: '', notes: '', weightLb: '', sets: Array.from({ length: 3 }, () => createSetDraft()),
});

export function createSessionDraft(template?: WorkoutVersionRecord, now = new Date()): SessionDraft {
  return {
    workoutName: template?.workoutName ?? '',
    date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    notes: '',
    exercises: template
      ? [...template.exercises].sort((a, b) => a.position - b.position).map(ex => ({
        ...blankExercise(), exerciseId: ex.exerciseId, exerciseName: ex.exerciseName,
      })) : [blankExercise()],
  };
}

export function draftFromRecord(record: WorkoutSessionRecord): SessionDraft {
  return {
    workoutName: record.workoutName, date: record.date, notes: record.notes ?? '',
    exercises: [...record.exercises].sort((a, b) => a.position - b.position).map(ex => ({
      key: ++keySeq, exerciseId: ex.exerciseId, exerciseName: ex.exerciseName, weightLb: String(ex.weightLb),
      notes: ex.notes ?? '',
      sets: [...ex.sets].sort((a, b) => a.setNumber - b.setNumber).map(set => createSetDraft(String(set.reps))),
    })),
  };
}

export function appendDraftSet(exercise: ExerciseDraft): ExerciseDraft {
  return exercise.sets.length >= MAX_SETS ? exercise : { ...exercise, sets: [...exercise.sets, createSetDraft()] };
}
export function removeDraftSet(exercise: ExerciseDraft, key: number): ExerciseDraft {
  return exercise.sets.length <= 1 ? exercise : { ...exercise, sets: exercise.sets.filter(set => set.key !== key) };
}
export function updateDraftSet(exercise: ExerciseDraft, key: number, reps: string): ExerciseDraft {
  return { ...exercise, sets: exercise.sets.map(set => set.key === key ? { ...set, reps } : set) };
}
export function draftSnapshot(draft: SessionDraft): string {
  return JSON.stringify({
    ...draft, exercises: draft.exercises.map(({ key: _key, noteSource: _source, noteEdited: _edited, sets, ...ex }) => ({
      ...ex, sets: sets.map(({ key: _setKey, ...set }) => set),
    })),
  });
}

function enteredNumber(value: string): number {
  if (!value.trim() || !Number.isFinite(Number(value))) throw new Error('Enter a number before saving.');
  return Number(value);
}

/** Call after field validation; never coerce an unentered numeric field to zero. */
export function draftToInput(draft: SessionDraft): SessionInput {
  return {
    workoutName: draft.workoutName.trim(), date: draft.date, notes: draft.notes.trim() ? draft.notes : null,
    exercises: draft.exercises.map(ex => ({
      ...(ex.exerciseId !== undefined ? { exerciseId: ex.exerciseId } : {}),
      exerciseName: ex.exerciseName.trim(), weightLb: enteredNumber(ex.weightLb),
      notes: ex.notes.trim() ? ex.notes : null,
      sets: ex.sets.map(set => ({ reps: enteredNumber(set.reps) })),
    })),
  };
}
