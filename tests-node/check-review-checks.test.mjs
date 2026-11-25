import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRequiredChecks, REQUIRED_CHECKS } from '../scripts/bench/check_review_checks.mjs';

const SHA = 'a'.repeat(40);
const OLD_SHA = 'b'.repeat(40);
function run(name, id, state = 'success', sha = SHA, event = 'pull_request') {
  return {
    name, id, head_sha: sha, event,
    status: state === 'in_progress' ? state : 'completed',
    conclusion: state === 'in_progress' ? null : state,
  };
}

test('accepts only two successful exact-head PR review workflows', () => {
  const state = evaluateRequiredChecks([
    run(REQUIRED_CHECKS[0], 10),
    run(REQUIRED_CHECKS[1], 11),
    run('Research preview', 12, 'failure'),
  ], SHA);
  assert.equal(state.passed, true);
  assert.equal(state.failed, false);
  assert.equal(state.checks.length, 2);
});

test('refuses stale green runs from any other commit', () => {
  const state = evaluateRequiredChecks([
    run(REQUIRED_CHECKS[0], 1, 'success', OLD_SHA),
    run(REQUIRED_CHECKS[1], 2, 'success', OLD_SHA),
  ], SHA);
  assert.equal(state.passed, false);
  assert.equal(state.failed, false);
  assert.ok(state.checks.every(c => c.state === 'pending'));
});

test('refuses green events that were not pull requests', () => {
  const state = evaluateRequiredChecks([
    run(REQUIRED_CHECKS[0], 1, 'success', SHA, 'push'),
    run(REQUIRED_CHECKS[1], 2, 'success', SHA, 'push'),
  ], SHA);
  assert.equal(state.passed, false);
});

test('the latest same-commit failure supersedes an earlier green run', () => {
  const state = evaluateRequiredChecks([
    run(REQUIRED_CHECKS[0], 3, 'success'),
    run(REQUIRED_CHECKS[0], 12, 'failure'),
    run(REQUIRED_CHECKS[1], 4, 'success'),
  ], SHA);
  assert.equal(state.passed, false);
  assert.equal(state.failed, true);
  assert.equal(state.checks[0].id, 12);
});

test('an unfinished required audit cannot authorize a live preview', () => {
  const state = evaluateRequiredChecks([
    run(REQUIRED_CHECKS[0], 3, 'success'),
    run(REQUIRED_CHECKS[1], 4, 'in_progress'),
  ], SHA);
  assert.equal(state.passed, false);
  assert.equal(state.failed, false);
  assert.equal(state.checks[1].state, 'pending');
});

test('invalid or missing evidence fails closed', () => {
  assert.throws(() => evaluateRequiredChecks([], 'wrong'), /Invalid/);
  assert.throws(() => evaluateRequiredChecks({}, SHA), /array/);
});
