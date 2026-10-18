import assert from 'node:assert/strict';
import { test } from 'node:test';
import { performanceBudget } from './performance-budget.mjs';

function probe(ms, advisory) {
  const checks = [], warnings = [];
  performanceBudget((name, ok) => checks.push(ok), 'timing', ms, 1, `${ms} ms`, {
    advisory, warn: message => warnings.push(message), github: false, summary: null,
  });
  return { checks, warnings };
}

test('local CPU budgets still reject overruns and exact-limit samples', () => {
  assert.deepEqual(probe(1.081, false).checks, [false]);
  assert.deepEqual(probe(1, false).checks, [false]);
  assert.deepEqual(probe(0.683, false).checks, [true]);
});

test('hosted overruns are warnings, never reported as passing checks', () => {
  const r = probe(1.081, true);
  assert.deepEqual(r.checks, []);
  assert.match(r.warnings[0], /1.081 ms.*budget < 1.000 ms/);
  assert.deepEqual(probe(0.683, true).checks, [true]);
});

test('invalid measurements fail even when timing is advisory', () => {
  for (const ms of [NaN, Infinity, -1]) {
    const r = probe(ms, true);
    assert.deepEqual(r.checks, [false]);
    assert.deepEqual(r.warnings, []);
  }
});
