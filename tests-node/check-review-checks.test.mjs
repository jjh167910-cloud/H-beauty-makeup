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

test('requires every exact-head integrated acceptance workflow', () => {
  const state = evaluateRequiredChecks([
    ...REQUIRED_CHECKS.map((name,i)=>run(name,10+i)),
    run('Research preview', 12, 'failure'),
  ], SHA);
  assert.equal(state.passed, true);
  assert.equal(state.failed, false);
  assert.equal(state.checks.length, 6);
  assert.ok(REQUIRED_CHECKS.includes('Public soft-liner calibration'));
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

test('missing any new calibration blocks integrated preview', () => {
  for (const omitted of REQUIRED_CHECKS) {
    const state=evaluateRequiredChecks(REQUIRED_CHECKS.filter(n=>n!==omitted).map((n,i)=>run(n,100+i)),SHA);
    assert.equal(state.passed,false);
    assert.equal(state.checks.find(c=>c.name===omitted).state,'pending');
  }
});

test('a rejected integrated calibration prevents publication even when other checks pass', () => {
  for(const failed of REQUIRED_CHECKS.slice(2)){
    const state=evaluateRequiredChecks(REQUIRED_CHECKS.map((n,i)=>run(n,200+i,n===failed?'failure':'success')),SHA);
    assert.equal(state.passed,false);
    assert.equal(state.failed,true);
  }
});
