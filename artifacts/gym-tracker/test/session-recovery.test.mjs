import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { recoveryKey, readCheckpoint, writeCheckpoint, clearCheckpoint, clearSessionRecovery } from '../src/lib/session-recovery.ts';
import { createSessionDraft, blankExercise, reserveDraftKeys, draftSnapshot } from '../src/lib/session-draft.ts';

function browserStore() {
  const data = new Map();
  const store = {
    get length() { return data.size; },
    key: i => [...data.keys()][i] ?? null,
    getItem: k => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
    removeItem: k => data.delete(k),
  };
  globalThis.window = { sessionStorage: store };
  return store;
}
function fixture() {
  const draft = createSessionDraft(undefined, new Date(2026, 10, 3));
  draft.workoutName = 'Recovery workout';
  draft.notes = 'Whole workout';
  draft.exercises[0] = {
    ...draft.exercises[0], exerciseId: 42, exerciseName: 'Bench', weightLb: '134.25',
    notes: 'Seat 3', noteEdited: true,
    sets: draft.exercises[0].sets.map((s, i) => ({ ...s, reps: ['10', '8', '6'][i] })),
  };
  return {
    version: 1, draft, baseline: 'original baseline',
    sourceVersionId: 70,
    template: { id: 70, workoutId: 5, versionNumber: 1, workoutName: 'Old version', savedAt: '2026-11-01T00:00:00Z', exercises: [{ id: 1, exerciseId: 42, exerciseName: 'Bench', position: 0 }] },
    reference: { kind: 'last-time', sessionId: 3, date: '2026-11-01', exercisesByKey: {} },
    touched: { weight: [draft.exercises[0].key], reps: [draft.exercises[0].sets[1].key], count: [] },
  };
}
afterEach(() => { clearSessionRecovery(); delete globalThis.window; });

test('checkpoint retains unequal reps, decimal pounds, all notes, keys, baseline and pinned provenance', () => {
  browserStore();
  const id = recoveryKey('owner', 'login', 'create:/sessions/new?workoutId=5');
  const data = fixture();
  assert.equal(writeCheckpoint(id, data), true);
  assert.deepEqual(readCheckpoint(id), data);
});

test('a cold module restores the complete checkpoint from tab storage after reload', async () => {
  browserStore();
  const id = recoveryKey('owner', 'login', 'edit:/sessions/3?');
  const data = fixture();
  writeCheckpoint(id, data);
  const cold = await import('../src/lib/session-recovery.ts?reload-test');
  assert.deepEqual(cold.readCheckpoint(id), data);
});

test('different users, auth sessions, modes and workout sources cannot read each other’s drafts', () => {
  browserStore();
  const id = recoveryKey('A', 'one', 'create:/sessions/new?workoutId=5');
  writeCheckpoint(id, fixture());
  for (const other of [
    recoveryKey('B', 'one', 'create:/sessions/new?workoutId=5'),
    recoveryKey('A', 'two', 'create:/sessions/new?workoutId=5'),
    recoveryKey('A', 'one', 'create:/sessions/new?workoutId=6'),
    recoveryKey('A', 'one', 'edit:/sessions/5?'),
  ]) assert.equal(readCheckpoint(other), null);
});

test('explicit draft removal clears both memory and persistent copy', () => {
  const store = browserStore();
  const id = recoveryKey('A', 'one', 'new');
  writeCheckpoint(id, fixture());
  clearCheckpoint(id);
  assert.equal(readCheckpoint(id), null);
  assert.equal(store.getItem(id), null);
});

test('logout/account switch removes all workout copies without clearing unrelated storage', () => {
  const store = browserStore();
  store.setItem('unrelated', 'keep');
  const a = recoveryKey('A', 'one', 'new'), b = recoveryKey('A', 'one', 'edit');
  writeCheckpoint(a, fixture()); writeCheckpoint(b, fixture());
  clearSessionRecovery();
  assert.equal(readCheckpoint(a), null); assert.equal(readCheckpoint(b), null);
  assert.equal(store.length, 1); assert.equal(store.getItem('unrelated'), 'keep');
});

test('blocked storage reports reload protection unavailable but retains the account-retry memory copy', () => {
  globalThis.window = { get sessionStorage() { throw new Error('Storage blocked'); } };
  const id = recoveryKey('A', 'one', 'new'), data = fixture();
  assert.equal(writeCheckpoint(id, data), false);
  assert.deepEqual(readCheckpoint(id), data);
  clearCheckpoint(id);
  assert.equal(readCheckpoint(id), null);
});

test('invalid JSON and malformed saved shapes are ignored rather than mounted', () => {
  const store = browserStore();
  const id = recoveryKey('A', 'one', 'new');
  for (const value of ['{bad', '{"version":99}', JSON.stringify({ ...fixture(), draft: { exercises: null } })]) {
    store.setItem(id, value);
    assert.equal(readCheckpoint(id), null);
  }
});

test('null provenance, blank values and added/removed rows survive a cold read', async () => {
  browserStore();
  const data = fixture();
  delete data.template; delete data.reference;
  data.sourceVersionId = null;
  data.draft.exercises.push(blankExercise());
  data.draft.exercises[0].sets.splice(1, 1);
  data.draft.exercises[0].notes = '';
  const id = recoveryKey('A', 'one', 'repeat');
  writeCheckpoint(id, data);
  const cold = await import('../src/lib/session-recovery.ts?repeat-test');
  assert.deepEqual(cold.readCheckpoint(id), data);
  assert.notEqual(draftSnapshot(data.draft), data.baseline);
});

test('restored local keys do not collide with subsequently added rows', () => {
  const data = fixture();
  data.draft.exercises[0].key = 9000;
  data.draft.exercises[0].sets[0].key = 9001;
  reserveDraftKeys(data.draft);
  const next = blankExercise();
  for (const key of [next.key, ...next.sets.map(s => s.key)]) assert(key > 9001);
});
