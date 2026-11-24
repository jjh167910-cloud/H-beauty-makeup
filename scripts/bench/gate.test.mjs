import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, loadRun, releasePolicy } from './gate.mjs';

const RUN_META = { set: 'quick', looks: ['soft-glam', 'icy'], engines: ['v2'],
  photos: ['light', 'deep'].flatMap(group => [0, 1, 2].map(n => ({ id: group + '-' + n, group }))) };
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

// Exercise the actual command line and verify reports do not expose photo identities.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test('CLI fails closed and writes an aggregate-only report', () => {
  const root = mkdtempSync(join(tmpdir(), 'hbeauty-gate-'));
  try {
    for (const [name, data] of [['old', run()], ['repeat', run()], ['new', run(r => {
      if (r.look === 'icy') r.cat_lid += 0.2;
    })]]) {
      const path = join(root, name); mkdirSync(path);
      mkdirSync(join(path, 'photos'));
      data.manifest.photos = data.manifest.photos.map(p => ({
        ...p, file: 'photos/' + p.id + '.png', source: 'synthetic',
      }));
      // Private-data contract: the CLI requires actual bytes for every source photo,
      // even in synthetic tests; these are not real faces or decodable photographs.
      for (const p of data.manifest.photos)
        writeFileSync(join(path, p.file), Buffer.from('deterministic-synthetic-' + p.id));
      writeFileSync(join(path, 'manifest.json'), JSON.stringify(data.manifest));
      writeFileSync(join(path, 'summary.json'), JSON.stringify(data.summary));
      writeFileSync(join(path, 'scores.jsonl'), data.rows.map(x => JSON.stringify(x)).join('\n') + '\n');
    }
    const out = join(root, 'gate.md');
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./gate.mjs', import.meta.url)),
      '--baseline', join(root, 'old'), '--repeat', join(root, 'repeat'),
      '--candidate', join(root, 'new'), '--out', out], { encoding: 'utf8' });
    assert.equal(result.status, 1, result.stderr);
    const report = readFileSync(out, 'utf8');
    assert.match(report, /FAIL/);
    assert.match(report, /icy/);
    assert.ok(!report.includes('light-0') && !report.includes('deep-2'), 'individual photo IDs must be private');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('rejects changed photo pixels even if the render IDs are identical', () => {
  const b = run(), r = run(), c = run();
  b.fingerprints = { 'photos/p.png': 'aabb' };
  r.fingerprints = { 'photos/p.png': 'aabb' };
  c.fingerprints = { 'photos/p.png': 'cdef' };
  const result = evaluate(b, r, c);
  assert.equal(result.pass, false);
  assert.match(result.issues.join('\n'), /input-photo or catalog-truth pixels changed/);
  assert.ok(!result.issues.join('\n').includes('p.png'));
});

test('omitting the same expected render from all three runs fails closed', () => {
  const b = run(), r = run(), c = run();
  for (const value of [b, r, c]) value.rows.pop();
  const result = evaluate(b, r, c);
  assert.equal(result.pass, false);
  assert.match(result.issues.join('\n'), /scores do not cover every expected manifest/);
});

test('rejects an unexpected render that is not in the manifest', () => {
  const b = run(), r = run(), c = run();
  c.rows[0].look = 'unexpected';
  const result = evaluate(b, r, c);
  assert.equal(result.pass, false);
  assert.match(result.issues.join('\n'), /scores do not cover every expected manifest/);
});

test('CLI refuses an absent catalog target even when every run omits it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hbeauty-missing-target-'));
  try {
    mkdirSync(join(dir, 'photos'));
    writeFileSync(join(dir, 'photos', 'catalog__orig.png'), Buffer.from('synthetic-public-test'));
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify({
      set: 'quick', looks: ['icy'], engines: ['v2'], photos: [
        { id: 'catalog__orig', file: 'photos/catalog__orig.png', source: 'catalog', group: 'catalog' },
      ],
    }));
    writeFileSync(join(dir, 'scores.jsonl'), JSON.stringify({
      photo: 'catalog__orig', engine: 'v2', look: 'icy', group: 'catalog',
      cat_lid: 1.5, outside: 0, clipped: 0, skin_fine: 0.8,
    }) + '\n');
    writeFileSync(join(dir, 'summary.json'), JSON.stringify({}));
    assert.throws(() => loadRun(dir), /Missing catalog reference truth/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('release policy rejects quick tests and incomplete skin-tone representation', () => {
  assert.match(releasePolicy(run().manifest).join(' / '), /Quick or unrecognized/);
  const looks = Array.from({ length: 48 }, (_, i) => 'look-' + i);
  const valid = {
    set: 'looks', looks,
    photos: [{ source: 'catalog', face: 'catalog', group: 'catalog', cond: 'orig' },
      ...['light', 'medium', 'deep'].flatMap(group => [1, 2].map(i => ({
        source: 'mste', group, face: group + '-' + i, cond: 'orig',
      })))],
  };
  assert.deepEqual(releasePolicy(valid), []);
  valid.photos.pop();
  assert.match(releasePolicy(valid).join(' / '), /two independent original-light/);
});


test('real-shaped 40-look scorer bundle passes private file-integrity and release gate end to end', () => {
  const root = mkdtempSync(join(tmpdir(), 'hbeauty-release-bundle-'));
  try {
    const looks = Array.from({ length: 40 }, (_, i) => 'look-' + i);
    const photos = [{ id: 'catalog__orig', file: 'photos/catalog__orig.png',
      source: 'catalog', group: 'catalog', face: 'catalog', cond: 'orig' },
    ...['light', 'medium', 'deep'].flatMap(group => [1, 2].map(n => ({
      id: group + n, file: 'photos/' + group + n + '.png',
      source: 'mste', group, face: group + n, cond: 'orig',
    })))];
    const manifest = { set: 'looks', looks, engines: ['v1'], photos };
    for (const variant of ['baseline', 'repeat', 'candidate']) {
      const dir = join(root, variant);
      mkdirSync(join(dir, 'photos'), { recursive: true });
      for (const p of photos) writeFileSync(join(dir, p.file), 'fixture-' + p.id);
      const rows = [];
      for (const look of looks) for (const p of photos) {
        rows.push({ photo: p.id, engine: 'v1', look, group: p.group,
          source: p.source, skin_fine: 0.8, skin_shading: 0.99,
          outside: 0, clipped: 0, eye_whites: 0, edge_bleed: 0,
          ...(p.source === 'catalog' ? { cat_lid: 1.25, cat_lip: 1.0, cat_face: 1.4 } : {}),
        });
      }
      for (const look of looks) {
        const truth = join(dir, 'truth', look);
        mkdirSync(truth, { recursive: true });
        writeFileSync(join(truth, 'catalog__orig.png'), 'fixture-truth-' + look);
      }
      writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
      writeFileSync(join(dir, 'summary.json'), JSON.stringify({}));
      writeFileSync(join(dir, 'scores.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n');
    }
    const report = join(root, 'release-report.md');
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./gate.mjs', import.meta.url)),
      '--baseline', join(root, 'baseline'), '--repeat', join(root, 'repeat'),
      '--candidate', join(root, 'candidate'), '--out', report], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr + '\n' + result.stdout);
    assert.match(readFileSync(report, 'utf8'), /PASS/);
    assert.ok(!readFileSync(report, 'utf8').includes('catalog__orig'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
