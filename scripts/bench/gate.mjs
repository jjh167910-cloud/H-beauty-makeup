import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Private benchmark release gate. Runs only beside local score.py output.
// No face images, per-person measurements, or benchmark runs are uploaded to CI.
// Directions and range are aligned with score.py TARGETS.
export const METRICS = {
  cat_lip: 'max', cat_lid: 'max', cat_cheek: 'max', cat_face: 'max',
  cat_iou_eyes: 'min', cat_shift_eyes: 'max', cat_lowlash: 'max',
  cat_water: 'max', cat_brow: 'max', brow_spill: 'max',
  cat_hollow: 'max', hollow_lift: 'max',
  light_lip: 'max', light_lid: 'max', light_cheek: 'max',
  skin_fine: [0.55, 0.95], skin_shading: 'min',
  edge_bleed: 'max', eye_whites: 'max', outside: 'max',
  clipped: 'max', drift: 'max', skin_blotch: 'max', crushed: 'max',
};

const num = v => typeof v === 'number' && Number.isFinite(v);
const fmt = n => num(n) ? n.toFixed(4) : 'n/a';
const percentile = (arr, q) => {
  const sorted = arr.filter(num).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const a = Math.floor(pos), b = Math.ceil(pos);
  return sorted[a] * (1 - (pos - a)) + sorted[b] * (pos - a);
};
const stats = (rows, field, way) => {
  const v = rows.map(r => r[field]).filter(num);
  if (!v.length) return null;
  if (Array.isArray(way)) return { n: v.length, lo: percentile(v, 0.1), hi: percentile(v, 0.9) };
  return { n: v.length, value: percentile(v, way === 'min' ? 0.1 : 0.9) };
};
const excess = (now, then, way) => {
  if (Array.isArray(way)) {
    const [lo, hi] = way;
    return Math.max(Math.max(0, lo - now.lo) - Math.max(0, lo - then.lo),
      Math.max(0, now.hi - hi) - Math.max(0, then.hi - hi));
  }
  return way === 'min' ? then.value - now.value : now.value - then.value;
};
const noise = (a, b, way) => Array.isArray(way)
  ? Math.max(Math.abs(a.lo - b.lo), Math.abs(a.hi - b.hi))
  : Math.abs(a.value - b.value);

const rowId = r => JSON.stringify([r.photo, r.engine, r.look]);
function uniqueRows(rows, label) {
  const map = new Map();
  for (const r of rows) {
    if (typeof r.photo !== 'string' || typeof r.look !== 'string' || typeof r.engine !== 'string')
      throw new Error(`${label}: invalid render identity`);
    const id = rowId(r);
    if (map.has(id)) throw new Error(`${label}: duplicate render identity`);
    map.set(id, r);
  }
  if (!map.size) throw new Error(`${label}: empty scores`);
  return map;
}

// Read only aggregate statistics and paired score rows. Do not include photo IDs in reports.
export function evaluate(baseline, repeat, candidate) {
  const issues = [], inspected = { cells: 0, metrics: 0 };
  const bm = uniqueRows(baseline.rows, 'baseline');
  const rm = uniqueRows(repeat.rows, 'repeat');
  const cm = uniqueRows(candidate.rows, 'candidate');
  // Fail closed against the manifest, not merely against the three result sets.
  // A run that silently omits the SAME 48th look / image on every version must not pass.
  const checkExpected = (run, found, label) => {
    const { looks, engines, photos } = run.manifest;
    if (!Array.isArray(looks) || !looks.length || !Array.isArray(engines) || !engines.length
        || !Array.isArray(photos) || !photos.length)
      throw new Error(label + ': incomplete benchmark manifest');
    const expected = new Set();
    for (const photo of photos) {
      if (!photo?.id || typeof photo.id !== 'string') throw new Error(label + ': missing photo id');
      for (const look of looks) for (const engine of engines) {
        const id = JSON.stringify([photo.id, engine, look]);
        if (expected.has(id)) throw new Error(label + ': duplicate expected render identity');
        expected.add(id);
      }
    }
    if (expected.size !== found.size || [...expected].some(id => !found.has(id)))
      issues.push(label + ': scores do not cover every expected manifest photo × look × engine ('
        + found.size + ' of ' + expected.size + ')');
  };
  checkExpected(baseline, bm, 'baseline');
  checkExpected(repeat, rm, 'repeat');
  checkExpected(candidate, cm, 'candidate');
  if (JSON.stringify(baseline.manifest.looks) !== JSON.stringify(candidate.manifest.looks)
      || JSON.stringify(baseline.manifest.looks) !== JSON.stringify(repeat.manifest.looks)
      || JSON.stringify(baseline.manifest.engines) !== JSON.stringify(candidate.manifest.engines)
      || JSON.stringify(baseline.manifest.engines) !== JSON.stringify(repeat.manifest.engines)
      || baseline.manifest.set !== candidate.manifest.set || baseline.manifest.set !== repeat.manifest.set)
    issues.push('Benchmark set or look coverage changed');
  for (const [name, m] of [['repeat', rm], ['candidate', cm]]) {
    if (m.size !== bm.size || [...bm.keys()].some(id => !m.has(id)))
      issues.push(`${name}: incomplete or mismatched render coverage (${m.size} versus ${bm.size})`);
  }
  if (JSON.stringify(baseline.manifest.photos ?? []) !== JSON.stringify(candidate.manifest.photos ?? [])
      || JSON.stringify(baseline.manifest.photos ?? []) !== JSON.stringify(repeat.manifest.photos ?? []))
    issues.push('Benchmark source-photo metadata changed');
  if ([baseline, repeat, candidate].some(run => run.fingerprints)) {
    const refs = [baseline, repeat, candidate].map(run => JSON.stringify(run.fingerprints ?? {}));
    if (refs[0] !== refs[1] || refs[0] !== refs[2])
      issues.push('Benchmark input-photo or catalog-truth pixels changed');
  }
  if (issues.length) return { pass: false, issues, inspected };

  const sets = [baseline.rows, repeat.rows, candidate.rows];
  const engines = [...new Set(baseline.rows.map(r => r.engine))].sort();
  const groupings = [
    ['engine', r => [r.engine]],
    ['look', r => [r.engine, r.look]],
    ['skin tone', r => [r.engine, r.group]],
    ['look × skin tone', r => [r.engine, r.look, r.group]],
  ];
  // Check matched set, each look, each skin-tone group and their intersection.
  for (const [level, pick] of groupings) {
    const buckets = sets.map(rows => {
      const m = new Map();
      for (const r of rows) {
        const keys = pick(r);
        if (keys.some(k => !k || typeof k !== 'string')) continue;
        const k = JSON.stringify(keys);
        if (!m.has(k)) m.set(k, { keys, rows: [] });
        m.get(k).rows.push(r);
      }
      return m;
    });
    for (const [k, b] of buckets[0]) {
      const rr = buckets[1].get(k), cc = buckets[2].get(k);
      if (!rr || !cc || b.rows.length !== rr.rows.length || b.rows.length !== cc.rows.length) {
        issues.push(`${level} ${b.keys.join(' / ')}: missing group coverage`);
        continue;
      }
      inspected.cells++;
      for (const [field, way] of Object.entries(METRICS)) {
        const [bs, rs, cs] = [b.rows, rr.rows, cc.rows].map(rows => stats(rows, field, way));
        if (!bs && !rs && !cs) continue;
        if (!bs || !rs || !cs || bs.n !== rs.n || bs.n !== cs.n) {
          issues.push(`${level} ${b.keys.join(' / ')} / ${field}: incomplete metric coverage`);
          continue;
        }
        inspected.metrics++;
        const tolerance = Math.max(noise(bs, rs, way), 1e-6);
        const regression = excess(cs, bs, way);
        if (regression > tolerance + 1e-9) {
          const before = Array.isArray(way) ? `${fmt(bs.lo)}–${fmt(bs.hi)}` : fmt(bs.value);
          const after = Array.isArray(way) ? `${fmt(cs.lo)}–${fmt(cs.hi)}` : fmt(cs.value);
          issues.push(`${level} ${b.keys.join(' / ')} / ${field}: ${before} → ${after} (worse ${fmt(regression)}, repeat noise ${fmt(tolerance)})`);
        }
      }
    }
  }
  // Fairness is derived across skin-tone groups: summary.json, not per-render rows.
  for (const engine of engines) {
    const getFair = r => r.summary?.[engine]?.lines?.['Skin-tone fairness, lipstick hue gap (°)'];
    const [b, r, c] = [baseline, repeat, candidate].map(getFair);
    if (![b, r, c].some(x => x && x.n > 0)) continue;
    if (![b, r, c].every(x => x && x.n > 0 && num(x.worst)) || b.n !== r.n || b.n !== c.n) {
      issues.push(`${engine}: incomplete skin-tone fairness coverage`);
      continue;
    }
    inspected.metrics++;
    if (c.worst - b.worst > Math.max(Math.abs(r.worst - b.worst), 1e-6))
      issues.push(`${engine}: lipstick fairness regressed ${fmt(b.worst)}° → ${fmt(c.worst)}°`);
  }
  return { pass: issues.length === 0, issues, inspected };
}

export function loadRun(dir) {
  const read = name => JSON.parse(readFileSync(join(dir, name), 'utf8'));
  const rows = readFileSync(join(dir, 'scores.jsonl'), 'utf8').trim().split('\n').map((s, i) => {
    try { return JSON.parse(s); } catch { throw new Error(`Malformed scores.jsonl at line ${i + 1}`); }
  });
  const manifest = read('manifest.json');
  const fingerprints = {};
  const digest = rel => createHash('sha256').update(readFileSync(join(dir, rel))).digest('hex');
  for (const photo of manifest.photos ?? []) {
    if (typeof photo.file !== 'string' || !/^photos\/[a-zA-Z0-9_.-]+\.png$/.test(photo.file))
      throw new Error('Malformed private benchmark photo manifest');
    fingerprints[photo.file] = digest(photo.file);
    if (photo.source === 'catalog') for (const look of manifest.looks) {
      if (!/^[a-z0-9-]+$/.test(look)) throw new Error('Malformed benchmark look name');
      const file = `truth/${look}/${photo.id}.png`;
      // A missing catalog target in all three runs is NOT a valid paired
      // benchmark: all could match by omitting the same required truth pixels.
      if (!existsSync(join(dir, file)))
        throw new Error('Missing catalog reference truth for expected photo × look');
      fingerprints[file] = digest(file);
    }
  }
  return { rows, summary: read('summary.json'), manifest, fingerprints };
}

function cli(args) {
  const opts = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--baseline', '--repeat', '--candidate', '--out'].includes(args[i]) || !args[i + 1])
      throw new Error('Usage: node gate.mjs --baseline RUN --repeat REPEAT_RUN --candidate RUN [--out report.md]');
    opts[args[i].slice(2)] = args[i + 1];
  }
  if (!opts.baseline || !opts.repeat || !opts.candidate)
    throw new Error('The baseline, same-code repeat and candidate runs are required');
  const result = evaluate(loadRun(opts.baseline), loadRun(opts.repeat), loadRun(opts.candidate));
  const text = `# Private try-on benchmark gate\n\nResult: **${result.pass ? 'PASS' : 'FAIL'}**\n\n` +
    `Compared ${result.inspected.cells} groups and ${result.inspected.metrics} metrics.\n\n` +
    (result.issues.length ? result.issues.map(i => `- ${i}`).join('\n') + '\n' : 'No regression above measured repeat noise.\n');
  if (opts.out) writeFileSync(opts.out, text);
  console.log(text);
  if (!result.pass) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { cli(process.argv.slice(2)); } catch (e) {
    console.error(`Benchmark gate error: ${e.message}`); process.exitCode = 2;
  }
}
