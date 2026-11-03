import { asc, eq } from "drizzle-orm";
import { sessionsTable, sessionExercisesTable, setsTable } from "@workspace/db";
import type { DashboardData, GetDashboardParams } from "@workspace/api-zod";
import { SessionNotFound, type SessionDatabase } from "./session-store";

const WEEK = 7 * 86400000;
const monday = (date: string) => {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.getTime();
};
const iso = (time: number) => new Date(time).toISOString().slice(0, 10);

/** Narrow, owned history only: no notes, provider identity or star data. */
async function history(database: SessionDatabase, userId: string) {
  return database.query.sessionsTable.findMany({
    where: eq(sessionsTable.userId, userId),
    columns: { id: true, workoutName: true, date: true },
    orderBy: [asc(sessionsTable.date), asc(sessionsTable.id)],
    with: {
      workoutVersion: {
        columns: { workoutId: true },
        with: { workout: { columns: { userId: true } } },
      },
      exercises: {
        columns: { id: true, exerciseId: true, exerciseName: true, weightLb: true },
        orderBy: [asc(sessionExercisesTable.position)],
        with: { sets: { columns: { reps: true }, orderBy: [asc(setsTable.setNumber)] } },
      },
    },
  });
}

function checkedInteger(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Training total exceeds supported precision");
  return value;
}

export async function ownedDashboard(database: SessionDatabase, userId: string, params: GetDashboardParams): Promise<DashboardData> {
  const sessions = await history(database, userId);
  // Template-linked history follows its stable workout identity across versions.
  // Pre-template sessions stay grouped by their immutable saved workout name.
  const workoutKey = (s: typeof sessions[number]) => s.workoutVersion?.workout.userId === userId
    ? `template:${s.workoutVersion.workoutId}` : `name:${s.workoutName}`;
  const exerciseNames = new Map<number, string>();
  const workoutNames = new Map<string, string>();
  let totalSets = 0;
  let totalReps = 0;
  const weeks = new Map<number, number>();
  for (const session of sessions) {
    const key = workoutKey(session);
    workoutNames.set(key, `${session.workoutName} (${key.startsWith("template:") ? "template" : "logged name"})`);
    const week = monday(session.date);
    weeks.set(week, (weeks.get(week) ?? 0) + 1);
    for (const entry of session.exercises) {
      exerciseNames.set(entry.exerciseId, entry.exerciseName);
      totalSets += entry.sets.length;
      for (const set of entry.sets) totalReps += set.reps;
    }
  }
  const exercises = [...exerciseNames].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
  const workouts = [...workoutNames].map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
  const selectedExerciseId = params.exerciseId ?? exercises[0]?.id ?? null;
  const selectedWorkoutKey = params.workoutKey ?? workouts[0]?.key ?? null;
  if (selectedExerciseId !== null && !exerciseNames.has(selectedExerciseId)) throw new SessionNotFound();
  if (selectedWorkoutKey !== null && !workoutNames.has(selectedWorkoutKey)) throw new SessionNotFound();

  const result: DashboardData = {
    totalSessions: sessions.length, totalSets: checkedInteger(totalSets), totalReps: checkedInteger(totalReps),
    exercises, workouts, selectedExerciseId, selectedWorkoutKey,
    weekly: [], weeklyWindowed: false, exerciseWeights: [], exerciseReps: [], workoutVolume: [],
  };
  if (weeks.size) {
    // Bound huge calendar ranges without truncating any all-time summary.
    const first = monday(sessions[0].date);
    const last = monday(sessions[sessions.length - 1].date);
    const start = Math.max(first, last - 103 * WEEK);
    result.weeklyWindowed = start > first;
    for (let time = start; time <= last; time += WEEK) {
      result.weekly.push({ weekStart: iso(time), sessionCount: weeks.get(time) ?? 0 });
    }
  }
  for (const session of sessions) {
    const point = { sessionId: session.id, date: session.date, workoutName: session.workoutName };
    const matching = session.exercises.filter(e => e.exerciseId === selectedExerciseId);
    if (matching.length) {
      let reps = 0;
      for (const entry of matching) {
        result.exerciseWeights.push({ ...point, entryId: entry.id, weightLb: entry.weightLb });
        for (const set of entry.sets) reps += set.reps;
      }
      result.exerciseReps.push({ ...point, totalReps: checkedInteger(reps) });
    }
    if (workoutKey(session) === selectedWorkoutKey) {
      // Integer cents avoid artifacts such as 0.1 * 3 = 0.30000000000000004.
      let cents = 0n;
      for (const entry of session.exercises) {
        const weightCents = BigInt(Math.round(entry.weightLb * 100));
        for (const set of entry.sets) cents += weightCents * BigInt(set.reps);
      }
      result.workoutVolume.push({ ...point, volumeLbReps: checkedInteger(Number(cents)) / 100 });
    }
  }
  return result;
}
