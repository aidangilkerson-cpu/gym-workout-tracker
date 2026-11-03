import assert from 'node:assert/strict';
import { test } from 'node:test';
import { latestWorkoutSession, repeatSessionSeed, templateSessionSeed } from '../src/lib/session-seed.ts';
import { draftSnapshot, draftToInput } from '../src/lib/session-draft.ts';

const now = () => new Date(2026, 10, 2, 23, 59);
const exercise = (exerciseId, position, reps = [10, 8, 6], weightLb = 135.25) => ({
  id: 100 + position, exerciseId, position, exerciseName: `Exercise ${exerciseId}`, weightLb,
  sets: reps.map((reps, i) => ({ id: 200 + position * 10 + i, setNumber: i + 1, reps })),
});
const record = (overrides = {}) => ({
  id: 10, workoutVersionId: 70, workoutName: 'Old upper', date: '2026-10-30',
  notes: 'Only the old session', starred: true, exercises: [exercise(1, 0)],
  ...overrides,
});
const version = (exercises = [{ exerciseId: 1, exerciseName: 'Bench renamed', position: 0 }]) => ({
  id: 71, workoutId: 5, versionNumber: 2, workoutName: 'Latest upper',
  savedAt: '2026-11-02T12:00:00Z', exercises,
});

test('repeat seeds copy unequal results into today, not old notes, record IDs or a star', () => {
  const source = record();
  const before = structuredClone(source);
  const seed = repeatSessionSeed(source, now());
  assert.equal(seed.draft.date, '2026-11-02');
  assert.equal(seed.draft.notes, '');
  assert.equal(seed.draft.workoutName, 'Old upper');
  assert.equal(seed.workoutVersionId, 70);
  assert.equal(seed.reference.kind, 'repeat');
  assert.equal(seed.reference.date, '2026-10-30');
  const wire = draftToInput(seed.draft);
  assert.deepEqual(wire.exercises[0].sets, [{ reps: 10 }, { reps: 8 }, { reps: 6 }]);
  assert.equal(wire.exercises[0].weightLb, 135.25);
  assert.equal(wire.exercises[0].exerciseId, 1);
  for (const field of ['id', 'starred', 'reference']) assert.equal(wire[field], undefined);
  assert.equal(wire.exercises[0].id, undefined);
  assert.equal(wire.exercises[0].sets[0].id, undefined);
  seed.draft.exercises[0].sets[1].reps = '0';
  assert.deepEqual(source, before, 'editing the new draft cannot mutate its source record');
  const ex = seed.draft.exercises[0];
  assert.equal(seed.reference.exercisesByKey[ex.key].repsByKey[ex.sets[1].key], '8');
});

test('ad-hoc repeats keep null provenance and explicit zero values', () => {
  const seed = repeatSessionSeed(record({ workoutVersionId: null, exercises: [exercise(1, 0, [0, 5], 0)] }), now());
  assert.equal(seed.workoutVersionId, null);
  assert.equal(draftToInput(seed.draft).exercises[0].weightLb, 0);
  assert.deepEqual(draftToInput(seed.draft).exercises[0].sets, [{ reps: 0 }, { reps: 5 }]);
});

test('latest matching workout is selected by version identity, date and deterministic ID', () => {
  const versions = [{ id: 70 }, { id: 71 }];
  const sessions = [
    record({ id: 999, date: '2026-10-29' }),
    record({ id: 11, date: '2026-10-31', workoutVersionId: 71 }),
    record({ id: 12, date: '2026-10-31', workoutVersionId: 70 }),
    record({ id: 1000, date: '2026-11-01', workoutVersionId: 999, workoutName: 'Latest upper' }),
    record({ id: 1001, date: '2026-11-02', workoutVersionId: null }),
  ];
  const before = structuredClone(sessions);
  assert.equal(latestWorkoutSession(sessions, versions).id, 12);
  assert.equal(latestWorkoutSession(sessions, []), undefined);
  assert.deepEqual(sessions, before);
});

test('latest preset structure wins; matching stable identities retain prior actual results', () => {
  const previous = record({ exercises: [exercise(1, 0), exercise(2, 1, [4], 70)] });
  const latest = version([
    { exerciseId: 1, exerciseName: 'Renamed bench', position: 1 },
    { exerciseId: 3, exerciseName: 'New squat', position: 0 },
  ]);
  const before = structuredClone(previous);
  const seed = templateSessionSeed(latest, previous, now());
  assert.equal(seed.workoutVersionId, 71);
  assert.equal(seed.draft.workoutName, 'Latest upper');
  assert.deepEqual(seed.draft.exercises.map(ex => ex.exerciseId), [3, 1]);
  assert.equal(seed.draft.exercises[0].weightLb, '');
  assert.deepEqual(seed.draft.exercises[0].sets.map(set => set.reps), ['', '', '']);
  assert.equal(seed.draft.exercises[1].exerciseName, 'Renamed bench');
  assert.deepEqual(seed.draft.exercises[1].sets.map(set => set.reps), ['10', '8', '6']);
  assert.equal(seed.reference.kind, 'last-time');
  assert.equal(seed.reference.exercisesByKey[seed.draft.exercises[0].key], undefined);
  assert.equal(seed.reference.exercisesByKey[seed.draft.exercises[1].key].setCount, 3);
  assert.deepEqual(previous, before);
});

test('a different exercise identity with the same name never inherits results', () => {
  const previous = record();
  const seed = templateSessionSeed(version([{ exerciseId: 99, exerciseName: 'Exercise 1', position: 0 }]), previous, now());
  assert.equal(seed.draft.exercises[0].weightLb, '');
  assert.equal(seed.reference, undefined);
});

test('duplicate exercise occurrences match separately instead of reusing the first result', () => {
  const previous = record({ exercises: [exercise(1, 0, [4], 100), exercise(1, 1, [6, 0], 80)] });
  const latest = version([
    { exerciseId: 1, exerciseName: 'Heavy', position: 0 },
    { exerciseId: 1, exerciseName: 'Back-off', position: 1 },
  ]);
  const seed = templateSessionSeed(latest, previous, now());
  assert.deepEqual(seed.draft.exercises.map(ex => ex.weightLb), ['100', '80']);
  assert.deepEqual(seed.draft.exercises.map(ex => ex.sets.map(s => s.reps)), [['4'], ['6', '0']]);
});

test('no history gives genuine blank defaults and no previous-value reference', () => {
  const seed = templateSessionSeed(version(), undefined, now());
  assert.equal(seed.reference, undefined);
  assert.equal(seed.draft.exercises[0].weightLb, '');
  assert.deepEqual(seed.draft.exercises[0].sets.map(s => s.reps), ['', '', '']);
  assert.throws(() => draftToInput(seed.draft), /Enter a number/);
});

test('reference metadata and regenerated local keys do not enter snapshots or payloads', () => {
  const a = templateSessionSeed(version(), record(), now());
  const b = templateSessionSeed(version(), record(), now());
  assert.equal(draftSnapshot(a.draft), draftSnapshot(b.draft));
  assert.notEqual(a.draft.exercises[0].key, b.draft.exercises[0].key);
  assert.equal(draftSnapshot(a.draft).includes('reference'), false);
  assert.equal(JSON.stringify(draftToInput(a.draft)).includes('repsByKey'), false);
  assert.equal(JSON.stringify(draftToInput(a.draft)).includes('sessionId'), false);
});
