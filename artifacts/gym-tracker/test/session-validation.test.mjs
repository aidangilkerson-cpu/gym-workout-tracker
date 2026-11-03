import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sessionErrorsFromResponse, validateSessionDraft } from '../src/lib/session-validation.ts';

const draft = () => ({
  workoutName: 'Validation check',
  date: '2026-11-02',
  notes: '',
  exercises: [{
    exerciseName: 'Bench press', weightLb: '135.25', setCount: '2', reps: '8',
    originalReps: null, setsTouched: true,
  }],
});

test('a valid draft accepts decimal weights, unweighted exercises, and zero reps', () => {
  assert.deepEqual(validateSessionDraft(draft()), {});
  const data = draft();
  data.exercises[0].weightLb = '0';
  data.exercises[0].reps = '0';
  assert.deepEqual(validateSessionDraft(data), {});
});

test('blank or whitespace-only required values get field-specific guidance', () => {
  const data = draft();
  data.workoutName = ' ';
  data.date = '';
  Object.assign(data.exercises[0], { exerciseName: ' ', weightLb: '', setCount: '', reps: '' });
  const errors = validateSessionDraft(data);
  for (const path of ['workoutName', 'date', 'exercises.0.exerciseName', 'exercises.0.weightLb', 'exercises.0.sets', 'exercises.0.reps']) {
    assert.ok(errors[path], path);
  }
});

test('weights reject negatives, non-finite values, excess precision, and values over the limit', () => {
  for (const value of ['-1', 'Infinity', 'NaN', '1.001', '100000000']) {
    const data = draft();
    data.exercises[0].weightLb = value;
    assert.ok(validateSessionDraft(data)['exercises.0.weightLb'], value);
  }
  for (const value of ['0', '0.01', '135.50', '99999999.99']) {
    const data = draft();
    data.exercises[0].weightLb = value;
    assert.equal(validateSessionDraft(data)['exercises.0.weightLb'], undefined, value);
  }
});

test('set counts and reps obey their existing integer ranges', () => {
  for (const value of ['0', '-1', '1.5', '101', 'Infinity']) {
    const data = draft();
    data.exercises[0].setCount = value;
    assert.ok(validateSessionDraft(data)['exercises.0.sets'], value);
  }
  for (const value of ['-1', '1.5', '2147483648', 'Infinity']) {
    const data = draft();
    data.exercises[0].reps = value;
    assert.ok(validateSessionDraft(data)['exercises.0.reps'], value);
  }
  const data = draft();
  data.exercises[0].setCount = '100';
  data.exercises[0].reps = '2147483647';
  assert.deepEqual(validateSessionDraft(data), {});
});

test('calendar validation handles leap days, impossible dates, and year bounds', () => {
  for (const value of ['', '0000-01-01', '2026-02-30', '2026-02-29', '2026-13-01', '10000-01-01']) {
    const data = draft();
    data.date = value;
    assert.ok(validateSessionDraft(data).date, value);
  }
  for (const value of ['0001-01-01', '2024-02-29', '9999-12-31']) {
    const data = draft();
    data.date = value;
    assert.equal(validateSessionDraft(data).date, undefined, value);
  }
});

test('text and exercise-list limits match the existing contract', () => {
  const data = draft();
  data.workoutName = 'a'.repeat(121);
  data.notes = 'b'.repeat(5001);
  data.exercises[0].exerciseName = 'c'.repeat(121);
  assert.ok(validateSessionDraft(data).workoutName);
  assert.ok(validateSessionDraft(data).notes);
  assert.ok(validateSessionDraft(data)['exercises.0.exerciseName']);
  data.exercises = [];
  assert.ok(validateSessionDraft(data).exercises);
  data.exercises = Array.from({ length: 51 }, () => draft().exercises[0]);
  assert.ok(validateSessionDraft(data).exercises);
});

test('untouched differing reps remain valid without requiring a replacement value', () => {
  const data = draft();
  Object.assign(data.exercises[0], { setCount: '3', reps: '', originalReps: [10, 8, 6], setsTouched: false });
  assert.deepEqual(validateSessionDraft(data), {});
  data.exercises[0].setsTouched = true;
  assert.ok(validateSessionDraft(data)['exercises.0.reps']);
});

test('API validation paths map to the correct visible exercise fields', () => {
  const errors = sessionErrorsFromResponse({ status: 400, data: { fieldErrors: {
    workoutName: 'Name required',
    'exercises.1.weightLb': 'Invalid weight',
    'exercises.1.sets': 'Invalid count',
    'exercises.0.sets.2.reps': 'Invalid reps',
    'exercises.0.exerciseId': 'Invalid exercise',
  } } }, 2);
  assert.deepEqual(errors, {
    workoutName: 'Name required',
    'exercises.1.weightLb': 'Invalid weight',
    'exercises.1.sets': 'Invalid count',
    'exercises.0.reps': 'Invalid reps',
    'exercises.0.exerciseName': 'Invalid exercise',
  });
});

test('nonvalidation errors and unknown paths cannot become field messages', () => {
  assert.deepEqual(sessionErrorsFromResponse({ status: 503, data: { fieldErrors: { workoutName: 'No' } } }, 1), {});
  assert.deepEqual(sessionErrorsFromResponse(null, 1), {});
  assert.deepEqual(sessionErrorsFromResponse({ status: 400, data: { fieldErrors: {
    userId: 'No', 'exercises.99.weightLb': 'No', notes: 42,
  } } }, 1), {});
});
