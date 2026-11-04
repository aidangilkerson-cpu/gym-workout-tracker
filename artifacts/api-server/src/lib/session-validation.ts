type Issue = { path: (string | number)[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-")) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Translate schema issues without returning submitted values or raw internals. */
export function sessionFieldErrors(body: unknown, issues: readonly Issue[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const path = issue.path.join(".") || "session";
    if (path === "workoutName") errors[path] = "Enter a workout name using 1–120 characters.";
    else if (path === "date") errors[path] = "Choose a valid calendar date.";
    else if (path === "notes") errors[path] = "Keep notes to 5,000 characters or fewer, or leave them blank.";
    else if (path === "exercises") errors[path] = "Include between 1 and 50 exercises.";
    else if (/^exercises\.\d+\.exerciseName$/.test(path)) errors[path] = "Enter an exercise name using 1–120 characters.";
    else if (/^exercises\.\d+\.notes$/.test(path)) errors[path] = "Keep the exercise note to 5,000 characters or fewer, or leave it blank.";
    else if (/^exercises\.\d+\.exerciseId$/.test(path)) errors[path] = "Choose a valid exercise.";
    else if (/^exercises\.\d+\.weightLb$/.test(path)) errors[path] = "Enter a weight from 0 to 99,999,999.99 lb, with no more than two decimal places.";
    else if (/^exercises\.\d+\.sets$/.test(path)) errors[path] = "Use between 1 and 100 sets.";
    else if (/^exercises\.\d+\.sets\.\d+(?:\.reps)?$/.test(path)) errors[path] = "Enter a whole number of reps from 0 to 2,147,483,647.";
    else errors[path] = "Check the exercise name, weight, sets, and reps.";
  }

  // Check these even if a different field failed the generated schema.
  if (isRecord(body)) {
    if (typeof body.workoutName === "string" && !body.workoutName.trim()) {
      errors.workoutName = "Enter a workout name.";
    }
    if (typeof body.date === "string" && !validDate(body.date)) {
      errors.date = "Choose a valid calendar date.";
    }
    if (Array.isArray(body.exercises)) {
      body.exercises.forEach((exercise, index) => {
        if (isRecord(exercise) && typeof exercise.exerciseName === "string" && !exercise.exerciseName.trim()) {
          errors[`exercises.${index}.exerciseName`] = "Enter an exercise name.";
        }
      });
    }
  }
  return errors;
}
