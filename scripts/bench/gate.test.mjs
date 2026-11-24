import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from './gate.mjs';

const RUN_META = { set: 'quick', looks: ['soft-glam', 'icy'] };
function run(change = () => {}, fairness = 6) {
  const rows = [];
  for (const look of RUN_META.looks) for (const group of ['light', 'deep']) {
    for (const n of [0, 1, 2]) {
      const row = {
        photo: `${group}-${n}`, engine: 'v2', look, group,
        cat_lid: look === 'icy' ? 2.1 : 1.1, eye_whites: 0.20,
        skin_fine: 0.80, outside: 0.001, clipped: 0,
      };
      change(row); rows.push(row);
    }
  }
  return { rows, manifest: structuredClone(RUN_META), summary: {
    v2: { lines: { 'Skin-tone fairness, lipstick hue gap (°)': {
      n: 2, worst: fairness,
    } } },
  } };
}

test('same-code repeat and same output pass', () => {
  const base = run(); const result = evaluate(base, run(), run());
  assert.equal(result.pass, true);
  assert.ok(result.inspected.cells > 0);
  assert.ok(result.inspected.metrics > 0);
});

test('catches a single look getting worse despite aggregate improvements', () => {
  const result = evaluate(run(), run(), run(r => {
    r.cat_lid += r.look === 'icy' && r.group === 'deep' ? 0.3 : -0.15;
  }));
  assert.equal(result.pass, false);
  assert.ok(result.issues.some(i => i.includes('icy / deep') && i.includes('cat_lid')));
  assert.ok(!result.issues.some(i => i.includes('photo:')));
});

test('accepts empirical repeat noise but rejects larger regression', () => {
  const r = run(r => { r.eye_whites += 0.015; });
  const allowed = evaluate(run(), r, run(r => { r.eye_whites += 0.014; }));
  assert.equal(allowed.pass, true);
  const rejected = evaluate(run(), r, run(r => { r.eye_whites += 0.025; }));
  assert.equal(rejected.pass, false);
});

test('detects incomplete render coverage instead of silently passing', () => {
  const candidate = run(); candidate.rows.pop();
  const result = evaluate(run(), run(), candidate);
  assert.equal(result.pass, false);
  assert.match(result.issues.join('\n'), /incomplete or mismatched render coverage/);
});

test('detects a missing metric and a duplicate render ID', () => {
  const candidate = run(r => { if (r.look === 'icy') delete r.cat_lid; });
  assert.equal(evaluate(run(), run(), candidate).pass, false);
  const dup = run(); dup.rows.push({ ...dup.rows[0] });
  assert.throws(() => evaluate(run(), run(), dup), /duplicate render identity/);
});

test('checks both sides of the skin texture interval', () => {
  assert.equal(evaluate(run(), run(), run(r => { r.skin_fine = 0.90; })).pass, true);
  assert.equal(evaluate(run(), run(), run(r => { r.skin_fine = 0.99; })).pass, false);
  assert.equal(evaluate(run(), run(), run(r => { r.skin_fine = 0.51; })).pass, false);
});

test('fails on fairness even when other metrics are identical', () => {
  assert.equal(evaluate(run(), run(), run(() => {}, 6.4)).pass, false);
});

test('fails if looks differ between benchmark runs', () => {
  const candidate = run(); candidate.manifest.looks.reverse();
  assert.equal(evaluate(run(), run(), candidate).pass, false);
});
