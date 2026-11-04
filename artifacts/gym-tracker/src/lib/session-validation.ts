export type FieldErrors = Record<string, string>;

type ExerciseFields = {
  exerciseName: string;
  notes?: string;
  weightLb: string;
  sets: { reps: string }[];
};

type SessionFields = {
  workoutName: string;
  date: string;
  notes: string;
  exercises: ExerciseFields[];
};

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function wholeNumber(value: string, min: number, max: number): boolean {
  const number = Number(value);
  return value.trim() !== '' && Number.isInteger(number) && number >= min && number <= max;
}

export function validateSessionDraft(draft: SessionFields): FieldErrors {
  const errors: FieldErrors = {};
  if (!draft.workoutName.trim()) errors.workoutName = 'Enter a workout name.';
  else if (draft.workoutName.length > 120) errors.workoutName = 'Use 120 characters or fewer for the workout name.';
  if (!validDate(draft.date)) errors.date = 'Choose a valid calendar date.';
  if (draft.notes.length > 5000) errors.notes = 'Keep notes to 5,000 characters or fewer.';
  if (draft.exercises.length < 1 || draft.exercises.length > 50) {
    errors.exercises = 'Include between 1 and 50 exercises.';
  }

  draft.exercises.forEach((exercise, index) => {
    const path = `exercises.${index}`;
    if ((exercise.notes?.length ?? 0) > 5000) errors[`${path}.notes`] = 'Keep the exercise note to 5,000 characters or fewer.';
    if (!exercise.exerciseName.trim()) errors[`${path}.exerciseName`] = 'Enter an exercise name.';
    else if (exercise.exerciseName.length > 120) errors[`${path}.exerciseName`] = 'Use 120 characters or fewer for the exercise name.';

    const weight = Number(exercise.weightLb);
    if (!exercise.weightLb.trim()) errors[`${path}.weightLb`] = 'Enter a weight in pounds. Use 0 for an unweighted exercise.';
    else if (!Number.isFinite(weight) || weight < 0 || weight > 99999999.99) {
      errors[`${path}.weightLb`] = 'Enter a weight from 0 to 99,999,999.99 lb.';
    } else if (Number(weight.toFixed(2)) !== weight) {
      errors[`${path}.weightLb`] = 'Use no more than two decimal places, such as 135.25.';
    }

    if (exercise.sets.length < 1 || exercise.sets.length > 100) {
      errors[`${path}.sets`] = 'Include between 1 and 100 sets for this exercise.';
    }
    exercise.sets.forEach((set, setIndex) => {
      if (!wholeNumber(set.reps, 0, 2147483647)) {
        errors[`${path}.sets.${setIndex}.reps`] = 'Enter a whole number of reps from 0 to 2,147,483,647.';
      }
    });
  });
  return errors;
}

/** Preserve each API set index, and reject messages pointing outside this draft. */
export function sessionErrorsFromResponse(error: unknown, setCounts: number[]): FieldErrors {
  const response = error as { status?: number; data?: { fieldErrors?: unknown } } | null;
  if (response?.status !== 400 || !response.data?.fieldErrors ||
      typeof response.data.fieldErrors !== 'object' || Array.isArray(response.data.fieldErrors)) return {};
  const errors: FieldErrors = {};
  for (const [path, message] of Object.entries(response.data.fieldErrors)) {
    if (typeof message !== 'string' || !message.trim()) continue;
    if (['workoutName', 'date', 'notes', 'exercises', 'session'].includes(path)) {
      errors[path] = message;
      continue;
    }
    const match = /^exercises\.(\d+)(?:\.(exerciseName|exerciseId|notes|weightLb|sets)(?:\.(\d+)(?:\.reps)?)?)?$/.exec(path);
    if (!match || Number(match[1]) >= setCounts.length) continue;
    const exIndex = Number(match[1]);
    if (match[3] !== undefined) {
      const setIndex = Number(match[3]);
      if (match[2] !== 'sets' || setIndex >= setCounts[exIndex]!) continue;
      errors[`exercises.${exIndex}.sets.${setIndex}.reps`] = message;
    } else {
      const field = !match[2] || match[2] === 'exerciseId' ? 'exerciseName' : match[2];
      errors[`exercises.${exIndex}.${field}`] = message;
    }
  }
  return errors;
}
