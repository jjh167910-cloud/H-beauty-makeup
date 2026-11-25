import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, writeFileSync, readFileSync, rmSync, copyFileSync, unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { packageBlindReview } from '../scripts/bench/package_blind_review.mjs';

const LOOKS = ['icy', 'mod-60s', 'cut-crease'];
const TEMPLATE = fileURLToPath(new URL('../scripts/bench/blind-review.template.html', import.meta.url));
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function fakePng(w = 900, h = 1200) {
  // Minimal test fixture for the packager's dimension/signature checks; it is
  // deliberately NOT a user-facing screenshot, and is never published.
  const png = Buffer.alloc(48);
  SIGNATURE.copy(png, 0);
  png.writeUInt32BE(13, 8);
  png.write('IHDR', 12);
  png.writeUInt32BE(w, 16);
  png.writeUInt32BE(h, 20);
  return png;
}

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'hbeauty-standalone-'));
  const summary = LOOKS.map((look, i) => ({
    look,
    baselineLstar: 45,
    repeatLstar: 45,
    candidateLstar: 45.5 + i,
    baselineRepeatedSafeHash: true,
    // Allowed only when the accompanying one-LSB budget remains safe.
    candidateSafeHashMatches: i === 0 ? false : true,
    pixels: {
      lipPixels: 0,
      outsideFace: i === 0 ? 7 : 0,
      outsideBoxes: i === 0 ? 21 : 0,
      outsideFaceOverOne: 0,
      outsideBoxOverOne: 0,
    },
  }));
  writeFileSync(join(dir, 'metrics.json'), JSON.stringify({
    fullCatalog: false, source: 'public catalog only', summary,
  }));
  copyFileSync(TEMPLATE, join(dir, 'blind-review.html'));
  for (const look of LOOKS)
    for (const kind of ['before', 'after'])
      writeFileSync(join(dir, look + '-' + kind + '.png'), fakePng());
  return { dir, summary };
}

test('embeds six PNG screenshots byte-identically into one offline HTML', () => {
  const { dir } = fixture();
  try {
    const result = packageBlindReview(dir);
    assert.equal(result.frameCount, 6);
    const html = readFileSync(result.output, 'utf8');
    assert.equal((html.match(/data:image\/png;base64,/g) || []).length, 6);
    assert.match(html, /embeddedImages\[trial.look/);
    assert.match(html, /Download blind-review JSON/);
    assert.doesNotMatch(html, /<script[^>]+src=|https?:\/\/|XMLHttpRequest|sendBeacon|localStorage/i);
    const manifest = JSON.parse(readFileSync(join(dir, 'standalone-integrity.json'), 'utf8'));
    assert.equal(manifest.source, 'public catalog only');
    assert.equal(manifest.looks.length, 3);
    const bytes = readFileSync(join(dir, 'icy-before.png'));
    assert.equal(manifest.originalPngSha256.icy.before,
      createHash('sha256').update(bytes).digest('hex'));
    assert.ok(html.includes(bytes.toString('base64')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('rejects private, incomplete and unsafe metrics without a standalone artifact', () => {
  const { dir, summary } = fixture();
  try {
    writeFileSync(join(dir, 'metrics.json'), JSON.stringify({
      fullCatalog: false, source: 'private portraits', summary,
    }));
    assert.throws(() => packageBlindReview(dir), /Only three public-only/);
    const unsafe = summary.map(x => ({ ...x, pixels: { ...x.pixels } }));
    unsafe[0].pixels.lipPixels = 1;
    writeFileSync(join(dir, 'metrics.json'), JSON.stringify({
      fullCatalog: false, source: 'public catalog only', summary: unsafe,
    }));
    assert.throws(() => packageBlindReview(dir), /GPU metrics lack proof/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('rejects tampered image dimensions and missing images', () => {
  const { dir } = fixture();
  try {
    writeFileSync(join(dir, 'icy-after.png'), fakePng(800, 1200));
    assert.throws(() => packageBlindReview(dir), /dimensions differ/);
    unlinkSync(join(dir, 'icy-after.png'));
    assert.throws(() => packageBlindReview(dir), /ENOENT/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
