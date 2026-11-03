import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_WEIGHT_LB, stepWeight } from '../src/lib/weight-step.ts';

test('whole-pound values move by one pound in either direction', () => {
  assert.equal(stepWeight('105', 1), '106');
  assert.equal(stepWeight('105', -1), '104');
});

test('one-decimal values keep their fractional part', () => {
  assert.equal(stepWeight('135.5', 1), '136.5');
  assert.equal(stepWeight('135.5', -1), '134.5');
});

test('two-decimal values keep their fractional part', () => {
  assert.equal(stepWeight('135.25', 1), '136.25');
  assert.equal(stepWeight('135.25', -1), '134.25');
});

test('hundredths are retained, not used as the increment', () => {
  assert.equal(stepWeight('0.01', 1), '1.01');
  assert.equal(stepWeight('100.99', 1), '101.99');
});

test('decreases cannot produce a negative weight', () => {
  assert.equal(stepWeight('0', -1), '0');
  assert.equal(stepWeight('0.25', -1), '0');
});

test('increases respect the existing maximum', () => {
  assert.equal(stepWeight(String(MAX_WEIGHT_LB), 1), String(MAX_WEIGHT_LB));
  assert.equal(stepWeight('99999999.25', 1), String(MAX_WEIGHT_LB));
  assert.equal(stepWeight(String(MAX_WEIGHT_LB), -1), '99999998.99');
});

test('repeated clicks do not accumulate floating-point drift', () => {
  let value = '135.29';
  for (let i = 0; i < 100; i++) value = stepWeight(value, 1);
  assert.equal(value, '235.29');
  for (let i = 0; i < 100; i++) value = stepWeight(value, -1);
  assert.equal(value, '135.29');
});

test('blank inputs have deterministic nonnegative arrow behavior', () => {
  assert.equal(stepWeight('', 1), '1');
  assert.equal(stepWeight('', -1), '0');
});

test('non-finite inputs are not silently replaced by another weight', () => {
  for (const value of ['NaN', 'Infinity', 'not a number']) {
    assert.equal(stepWeight(value, 1), value);
    assert.equal(stepWeight(value, -1), value);
  }
});
