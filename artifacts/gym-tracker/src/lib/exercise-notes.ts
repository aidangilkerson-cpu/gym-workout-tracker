import type { WorkoutSessionRecord } from '@workspace/api-client-react';
import type { ExerciseDraft } from './session-draft.ts';

export type PreviousNote = { notes: string; date: string; workoutName: string };

/** Caller supplies only owned history. A blank latest note is still authoritative. */
export function latestExerciseNotes(sessions: WorkoutSessionRecord[]): Map<number, PreviousNote> {
  const notes = new Map<number, PreviousNote>();
  for (const session of [...sessions].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)) {
    // If the same exercise occurs twice, the last occurrence is the final note.
    for (const exercise of [...session.exercises].sort((a, b) => b.position - a.position)) {
      if (!notes.has(exercise.exerciseId)) {
        notes.set(exercise.exerciseId, {
          notes: exercise.notes ?? '', date: session.date, workoutName: session.workoutName,
        });
      }
    }
  }
  return notes;
}

/** Mirror library selection: pick a real active identity, never join history by name. */
export function exerciseIdForName(name: string, library: { id: number; name: string }[]): number | undefined {
  return [...library].sort((a, b) => a.id - b.id)
    .find(ex => ex.name.toLowerCase() === name.trim().toLowerCase())?.id;
}

export function withPreviousNote(exercise: ExerciseDraft, history: Map<number, PreviousNote>): ExerciseDraft {
  if (exercise.noteEdited) return exercise;
  const previous = exercise.exerciseId === undefined ? undefined : history.get(exercise.exerciseId);
  return {
    ...exercise, notes: previous?.notes ?? '',
    noteSource: previous ? { date: previous.date, workoutName: previous.workoutName } : undefined,
  };
}
