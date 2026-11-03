import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  appendDraftSet, blankExercise, createSessionDraft, draftFromRecord, draftSnapshot,
  draftToInput, removeDraftSet, updateDraftSet,
} from '../src/lib/session-draft.ts';

const record = () => ({
  id: 10, userId: 'fixture', workoutVersionId: 20, workoutName: ' Upper ', date: '2026-11-02',
  notes: 'Saved note', starred: false,
  exercises: [{
    id: 11, sessionId: 10, exerciseId: 30, exerciseName: ' Bench ', position: 0, weightLb: 135.25,
    sets: [10, 8, 6].map((reps, i) => ({ id: 40 + i, sessionExerciseId: 11, setNumber: i + 1, reps })),
  }],
});

test('record conversion preserves all distinct reps, weights, identities and calendar dates', () => {
  const source = record();
  // Network responses need not arrive in array order; honor explicit saved order.
  source.exercises[0].sets.reverse();
  const draft = draftFromRecord(source);
  assert.deepEqual(draft.exercises[0].sets.map(s => s.reps), ['10', '8', '6']);
  const input = draftToInput(draft);
  assert.equal(input.date, '2026-11-02');
  assert.equal(input.exercises[0].weightLb, 135.25);
  assert.equal(input.exercises[0].exerciseId, 30);
  assert.deepEqual(input.exercises[0].sets, [{ reps: 10 }, { reps: 8 }, { reps: 6 }]);
  assert.equal(input.workoutVersionId, undefined, 'the caller keeps version-link policy, not the draft converter');
  assert.equal(input.exercises[0].key, undefined);
  assert.equal(input.exercises[0].sets[0].key, undefined);
  assert.deepEqual(source.exercises[0].sets.map(s => s.reps), [6, 8, 10], 'input record is not mutated');
});

test('editing one set and adding/removing a middle row preserves surviving values and keys', () => {
  const draft = draftFromRecord(record());
  const original = draft.exercises[0];
  const changed = updateDraftSet(original, original.sets[1].key, '7');
  assert.deepEqual(changed.sets.map(s => s.reps), ['10', '7', '6']);
  assert.deepEqual(original.sets.map(s => s.reps), ['10', '8', '6']);
  const appended = appendDraftSet(changed);
  assert.deepEqual(appended.sets.map(s => s.reps), ['10', '7', '6', '']);
  assert.equal(new Set(appended.sets.map(s => s.key)).size, 4);
  const removed = removeDraftSet(appended, changed.sets[1].key);
  assert.deepEqual(removed.sets.map(s => s.reps), ['10', '6', '']);
  assert.deepEqual(removed.sets.slice(0, 2).map(s => s.key), [original.sets[0].key, original.sets[2].key]);
  const ready = updateDraftSet(removed, removed.sets[2].key, '0');
  assert.deepEqual(draftToInput({ ...draft, exercises: [ready] }).exercises[0].sets, [{ reps: 10 }, { reps: 6 }, { reps: 0 }]);
});

test('set helpers enforce the one-set minimum and hundred-set maximum', () => {
  const first = blankExercise();
  const single = { ...first, sets: [first.sets[0]] };
  assert.equal(removeDraftSet(single, single.sets[0].key), single);
  let exercise = first;
  while (exercise.sets.length < 100) exercise = appendDraftSet(exercise);
  assert.equal(appendDraftSet(exercise), exercise);
  assert.equal(new Set(exercise.sets.map(s => s.key)).size, 100);
});

test('blank template drafts preserve exercise order/IDs without inventing previous results', () => {
  const template = {
    id: 20, workoutId: 2, versionNumber: 3, workoutName: 'Upper', savedAt: '2026-11-02T12:00:00Z',
    exercises: [
      { id: 1, exerciseId: 32, exerciseName: 'Row', position: 1 },
      { id: 2, exerciseId: 31, exerciseName: 'Bench', position: 0 },
    ],
  };
  const draft = createSessionDraft(template, new Date(2026, 10, 2, 12));
  assert.equal(draft.date, '2026-11-02');
  assert.equal(draft.workoutName, 'Upper');
  assert.deepEqual(draft.exercises.map(e => [e.exerciseId, e.exerciseName]), [[31, 'Bench'], [32, 'Row']]);
  for (const ex of draft.exercises) {
    assert.equal(ex.weightLb, '');
    assert.deepEqual(ex.sets.map(s => s.reps), ['', '', '']);
  }
  assert.throws(() => draftToInput(draft), /Enter a number/);
});

test('dirty snapshots omit local keys but detect every individual rep or row change', () => {
  const a = draftFromRecord(record());
  const b = draftFromRecord(record());
  assert.equal(draftSnapshot(a), draftSnapshot(b));
  b.exercises[0] = updateDraftSet(b.exercises[0], b.exercises[0].sets[2].key, '0');
  assert.notEqual(draftSnapshot(a), draftSnapshot(b));
  const noteEdit = { ...a, notes: 'Changed note' };
  assert.deepEqual(draftToInput(noteEdit).exercises, draftToInput(a).exercises);
});

test('conversion rejects blank/nonfinite numbers instead of inventing zero; explicit zero persists', () => {
  for (const value of ['', ' ', 'Infinity', 'NaN']) {
    const draft = draftFromRecord(record());
    draft.exercises[0].sets[0].reps = value;
    assert.throws(() => draftToInput(draft), /Enter a number/);
  }
  const draft = draftFromRecord(record());
  draft.exercises[0].weightLb = '0';
  draft.exercises[0].sets[0].reps = '0';
  assert.equal(draftToInput(draft).exercises[0].weightLb, 0);
  assert.equal(draftToInput(draft).exercises[0].sets[0].reps, 0);
});
