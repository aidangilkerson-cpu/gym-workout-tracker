import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sessionErrorsFromResponse, validateSessionDraft } from '../src/lib/session-validation.ts';

const draft = () => ({
  workoutName: 'Validation check',
  date: '2026-11-02',
  notes: '',
  exercises: [{
    exerciseName: 'Bench press', weightLb: '135.25', sets: [{ reps: '8' }, { reps: '6' }],
  }],
});

test('a valid draft accepts decimal weights, unweighted exercises, and zero reps', () => {
  assert.deepEqual(validateSessionDraft(draft()), {});
  const data = draft();
  data.exercises[0].weightLb = '0';
  data.exercises[0].sets[0].reps = '0';
  assert.deepEqual(validateSessionDraft(data), {});
});

test('blank or whitespace-only required values get field-specific guidance', () => {
  const data = draft();
  data.workoutName = ' ';
  data.date = '';
  Object.assign(data.exercises[0], { exerciseName: ' ', weightLb: '', sets: [{ reps: '' }] });
  const errors = validateSessionDraft(data);
  for (const path of ['workoutName', 'date', 'exercises.0.exerciseName', 'exercises.0.weightLb', 'exercises.0.sets.0.reps']) {
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

test('set arrays and individual reps obey their existing bounds', () => {
  for (const count of [0, 101]) {
    const data = draft();
    data.exercises[0].sets = Array.from({ length: count }, () => ({ reps: '1' }));
    assert.ok(validateSessionDraft(data)['exercises.0.sets'], String(count));
  }
  for (const value of ['', ' ', '-1', '1.5', '2147483648', 'Infinity', 'NaN']) {
    const data = draft();
    data.exercises[0].sets[1].reps = value;
    const errors = validateSessionDraft(data);
    assert.ok(errors['exercises.0.sets.1.reps'], value);
    assert.equal(errors['exercises.0.sets.0.reps'], undefined);
  }
  const data = draft();
  data.exercises[0].sets = Array.from({ length: 100 }, () => ({ reps: '2147483647' }));
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

test('differing reps are individually valid, without a shared replacement field', () => {
  const data = draft();
  data.exercises[0].sets = [{ reps: '10' }, { reps: '8' }, { reps: '6' }];
  assert.deepEqual(validateSessionDraft(data), {});
  data.exercises[0].sets[1].reps = '';
  assert.deepEqual(Object.keys(validateSessionDraft(data)), ['exercises.0.sets.1.reps']);
});

test('API validation paths map to the correct visible exercise fields', () => {
  const errors = sessionErrorsFromResponse({ status: 400, data: { fieldErrors: {
    workoutName: 'Name required',
    'exercises.1.weightLb': 'Invalid weight',
    'exercises.1.sets': 'Invalid count',
    'exercises.0.sets.2.reps': 'Invalid reps',
    'exercises.0.exerciseId': 'Invalid exercise',
  } } }, [3, 2]);
  assert.deepEqual(errors, {
    workoutName: 'Name required',
    'exercises.1.weightLb': 'Invalid weight',
    'exercises.1.sets': 'Invalid count',
    'exercises.0.sets.2.reps': 'Invalid reps',
    'exercises.0.exerciseName': 'Invalid exercise',
  });
});

test('nonvalidation errors and unknown paths cannot become field messages', () => {
  assert.deepEqual(sessionErrorsFromResponse({ status: 503, data: { fieldErrors: { workoutName: 'No' } } }, [1]), {});
  assert.deepEqual(sessionErrorsFromResponse(null, [1]), {});
  assert.deepEqual(sessionErrorsFromResponse({ status: 400, data: { fieldErrors: {
    userId: 'No', 'exercises.99.weightLb': 'No', notes: 42,
    'exercises.0.sets.99.reps': 'No', 'exercises.0.weightLb.0': 'No',
    'exercises.0.sets.0.unknown': 'No',
  } } }, [1]), {});
});
