import { z } from 'zod';
import type { SessionDraft } from './session-draft';
import type { SessionSeed } from './session-seed';
import type { WorkoutVersionRecord } from '@workspace/api-client-react';

const key = z.number().int().positive();
const draftSchema = z.object({
  workoutName: z.string(), date: z.string(), notes: z.string(),
  exercises: z.array(z.object({
    key, exerciseId: key.optional(), exerciseName: z.string(), weightLb: z.string(), notes: z.string(),
    noteSource: z.object({ date: z.string(), workoutName: z.string() }).optional(),
    noteEdited: z.boolean().optional(),
    sets: z.array(z.object({ key, reps: z.string() })).min(1).max(100),
  })).min(1).max(100),
});
const referenceSchema = z.object({
  kind: z.enum(['repeat', 'last-time']), sessionId: key, date: z.string(),
  exercisesByKey: z.record(z.string(), z.object({
    weightLb: z.string(), setCount: z.number().int(),
    repsByKey: z.record(z.string(), z.string()),
  })),
});
const templateSchema = z.object({
  id: key, workoutId: key, versionNumber: key, workoutName: z.string(), savedAt: z.string(),
  exercises: z.array(z.object({ id: key, exerciseId: key, exerciseName: z.string(), position: z.number().int() })),
});
const schema = z.object({
  version: z.literal(1), draft: draftSchema, baseline: z.string(),
  template: templateSchema.optional(),
  sourceVersionId: key.nullable().optional(),
  reference: referenceSchema.optional(),
  touched: z.object({ weight: z.array(key), reps: z.array(key), count: z.array(key) }),
});

export type SessionCheckpoint = {
  version: 1; draft: SessionDraft; baseline: string;
  template?: WorkoutVersionRecord; sourceVersionId?: number | null;
  reference?: SessionSeed['reference'];
  touched: { weight: number[]; reps: number[]; count: number[] };
};

const prefix = 'liftledgr:session-draft:v1:';
// Memory survives account-gate remounts even if browser storage is unavailable.
const memory = new Map<string, SessionCheckpoint>();
function storage(): Storage | undefined {
  try { return typeof window === 'undefined' ? undefined : window.sessionStorage; }
  catch { return undefined; }
}

/** Separate tabs, authenticated sessions, users, create sources, and edit targets. */
export function recoveryKey(userId: string, sessionId: string, route: string): string {
  return prefix + JSON.stringify([userId, sessionId, route]);
}

export function readCheckpoint(id: string): SessionCheckpoint | null {
  const cached = memory.get(id);
  if (cached) return cached;
  try {
    const raw = storage()?.getItem(id);
    if (!raw) return null;
    const parsed = schema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const data: SessionCheckpoint = parsed.data;
    memory.set(id, data);
    return data;
  } catch { return null; }
}

/** false means this tab's memory works, but reload recovery is unavailable. */
export function writeCheckpoint(id: string, data: SessionCheckpoint): boolean {
  memory.set(id, data);
  try {
    const store = storage();
    if (!store) return false;
    store.setItem(id, JSON.stringify(data));
    return true;
  } catch { return false; }
}

export function clearCheckpoint(id: string) {
  memory.delete(id);
  try { storage()?.removeItem(id); } catch { /* Memory is already cleared. */ }
}

/** Called on confirmed logout/account switch, not on transient network errors. */
export function clearSessionRecovery() {
  memory.clear();
  try {
    const store = storage();
    if (!store) return;
    for (let i = store.length - 1; i >= 0; i--) {
      const id = store.key(i);
      if (id?.startsWith(prefix)) store.removeItem(id);
    }
  } catch { /* A blocked store cannot expose a draft in another session scope. */ }
}
