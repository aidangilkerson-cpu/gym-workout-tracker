import test from 'node:test';
import assert from 'node:assert/strict';
import { latestExerciseNotes, withPreviousNote, exerciseIdForName } from '../src/lib/exercise-notes.ts';
import { blankExercise, draftFromRecord, draftToInput, draftSnapshot } from '../src/lib/session-draft.ts';
import { validateSessionDraft, sessionErrorsFromResponse } from '../src/lib/session-validation.ts';

const entry = (exerciseId, notes, position = 0) => ({
  id: 10, exerciseId, exerciseName: 'Bench press', notes, position, weightLb: 135,
  sets: [{ id: 11, setNumber: 1, reps: 8 }],
});
const session = (id, date, workoutName, exercises) => ({
  id, date, workoutName, workoutVersionId: null, notes: 'Session-level note', starred: false, exercises,
});

test('notes follow stable exercise identities across unrelated workouts, not their names', () => {
  const sessions = [
    session(1, '2026-11-01', 'Push A', [entry(5, 'Seat 3')]),
    session(2, '2026-11-02', 'Full body', [entry(5, 'Seat 4'), entry(8, 'Different machine', 1)]),
  ];
  const history = latestExerciseNotes(sessions);
  const draft = withPreviousNote({ ...blankExercise(), exerciseId: 5 }, history);
  assert.equal(draft.notes, 'Seat 4');
  assert.deepEqual(draft.noteSource, { date: '2026-11-02', workoutName: 'Full body' });
  assert.equal(withPreviousNote({ ...blankExercise(), exerciseId: 8 }, history).notes, 'Different machine');
  assert.equal(withPreviousNote({ ...blankExercise(), exerciseId: 99 }, history).notes, '');
  assert.equal(sessions[0].exercises[0].notes, 'Seat 3');
});

test('latest blank notes suppress older text; dates, IDs and duplicate positions resolve deterministically', () => {
  const history = latestExerciseNotes([
    session(8, '2026-11-01', 'Older date', [entry(5, 'Old')]),
    session(2, '2026-11-02', 'Earlier same day', [entry(5, 'Earlier')]),
    session(3, '2026-11-02', 'Latest', [entry(5, 'First', 0), entry(5, null, 1)]),
  ]);
  assert.equal(history.get(5).notes, '');
  assert.equal(history.get(5).workoutName, 'Latest');
  assert.equal(latestExerciseNotes([]).size, 0);
});

test('library matching resolves a real identity; unrelated/new names never reuse history', () => {
  const library = [{ id: 9, name: 'Bench press' }, { id: 5, name: 'Bench press' }];
  assert.equal(exerciseIdForName(' BENCH PRESS ', library), 5);
  assert.equal(exerciseIdForName('Another exercise', library), undefined);
  assert.equal(exerciseIdForName('Bench press', []), undefined);
  assert.equal(withPreviousNote(blankExercise(), new Map([[5, { notes: 'Private note' }]])).notes, '');
});

test('custom edits and clears are not overwritten by automatic note hydration', () => {
  const history = new Map([[5, { notes: 'Seat 4', date: '2026-11-02', workoutName: 'Push' }]]);
  for (const notes of ['Custom cue', '']) {
    const edited = { ...blankExercise(), exerciseId: 5, notes, noteEdited: true };
    assert.equal(withPreviousNote(edited, history), edited);
  }
  const auto = withPreviousNote({ ...blankExercise(), exerciseId: 5 }, history);
  const renamed = withPreviousNote({ ...auto, exerciseId: undefined }, history);
  assert.equal(renamed.notes, '');
  assert.equal(renamed.noteSource, undefined);
});

test('saved-note edit round trips separately from session notes; metadata is never sent', () => {
  const source = session(1, '2026-11-01', 'Push', [entry(5, 'Seat 3')]);
  const draft = draftFromRecord(source);
  draft.exercises[0].notes = 'Seat 4';
  draft.exercises[0].noteSource = { date: '2026-10-31', workoutName: 'Other' };
  draft.exercises[0].noteEdited = true;
  const input = draftToInput(draft);
  assert.equal(input.exercises[0].notes, 'Seat 4');
  assert.equal(input.notes, 'Session-level note');
  assert.equal(input.exercises[0].noteSource, undefined);
  assert.equal(input.exercises[0].noteEdited, undefined);
  assert.equal(source.exercises[0].notes, 'Seat 3');
  const baseline = draftSnapshot(draft);
  delete draft.exercises[0].noteSource;
  delete draft.exercises[0].noteEdited;
  assert.equal(draftSnapshot(draft), baseline);
  draft.exercises[0].notes = '';
  assert.notEqual(draftSnapshot(draft), baseline);
  assert.equal(draftToInput(draft).exercises[0].notes, null);
});

test('note limits and server field errors address the exercise note, not session notes', () => {
  const draft = draftFromRecord(session(1, '2026-11-01', 'Push', [entry(5, 'a'.repeat(5001))]));
  assert.match(validateSessionDraft(draft)['exercises.0.notes'], /5,000/);
  assert.deepEqual(sessionErrorsFromResponse({
    status: 400, data: { fieldErrors: { 'exercises.0.notes': 'Too long', 'exercises.8.notes': 'Ignore' } },
  }, [1]), { 'exercises.0.notes': 'Too long' });
  draft.exercises[0].notes = 'a'.repeat(5000);
  assert.deepEqual(validateSessionDraft(draft), {});
});
