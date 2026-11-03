import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readSessionFilters, sessionListUrl } from '../src/lib/session-filters.ts';

test('missing filters default to all sessions, blank search and newest first', () => {
  assert.deepEqual(readSessionFilters(''), { starredOnly: false, q: '', sort: 'newest' });
  assert.equal(sessionListUrl(readSessionFilters('')), '/sessions');
});

test('URL round trip preserves stars, literal search characters and oldest ordering', () => {
  const state = { starredOnly: true, q: 'Upper 100%_\\ + & # day', sort: 'oldest' };
  const url = sessionListUrl(state);
  assert.deepEqual(readSessionFilters(url.split('?')[1]), state);
});

test('switching view keeps search and sorting', () => {
  const state = readSessionFilters('view=starred&q=Upper&sort=oldest');
  assert.deepEqual(readSessionFilters(sessionListUrl({ ...state, starredOnly: false }).split('?')[1]),
    { starredOnly: false, q: 'Upper', sort: 'oldest' });
});

test('clearing search keeps stars and date sorting', () => {
  const state = readSessionFilters('view=starred&q=Upper&sort=oldest');
  assert.equal(sessionListUrl({ ...state, q: '' }), '/sessions?view=starred&sort=oldest');
});

test('search whitespace is trimmed and blank search is omitted', () => {
  const state = readSessionFilters('sort=oldest');
  assert.equal(sessionListUrl({ ...state, q: '  Upper  ' }), '/sessions?q=Upper&sort=oldest');
  assert.equal(sessionListUrl({ ...state, q: '   ' }), '/sessions?sort=oldest');
});

test('unknown view/sort URLs normalize to safe defaults; long queries are not silently truncated', () => {
  assert.deepEqual(readSessionFilters('view=foreign&sort=broken'), readSessionFilters(''));
  assert.equal(readSessionFilters('q=' + 'x'.repeat(121)).q.length, 121); // API returns an honest 400.
});
