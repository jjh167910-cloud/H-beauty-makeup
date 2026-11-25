import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeBlindReview } from '../scripts/bench/make_blind_review.mjs';

const LOOKS = ['icy', 'mod-60s', 'cut-crease'];
const PNG_SIGNATURE = Buffer.from([137,80,78,71,13,10,26,10]);
function inputDir() {
  const dir = mkdtempSync(join(tmpdir(), 'hbeauty-blind-test-'));
  writeFileSync(join(dir,'metrics.json'), JSON.stringify({
    source: 'public catalog only',
    fullCatalog: false,
    summary: LOOKS.map(look => ({ look, baselineLstar:40, candidateLstar:40.5 })),
  }));
  for(const look of LOOKS) for(const name of ['before','after'])
    writeFileSync(join(dir, look+'-'+name+'.png'), PNG_SIGNATURE);
  return dir;
}

test('produces static A/B review from exactly three public diagnostic looks', () => {
  const dir = inputDir();
  try {
    assert.equal(makeBlindReview(dir).looks,3);
    const html = readFileSync(join(dir,'blind-review.html'),'utf8');
    assert.match(html,/BLIND RESEARCH REVIEW/);
    assert.match(html,/hbeauty-public-blind-review-v1/);
    assert.match(html,/URL\.createObjectURL/);
    assert.match(html,/shown_as_A/);
    assert.match(html,/data-answer="same"/);
    assert.doesNotMatch(html, /<script\s+src=|https?:\/\/|XMLHttpRequest|navigator\.sendBeacon|localStorage/i);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test('rejects private photo provenance instead of exporting unreviewed evidence', () => {
  const dir = inputDir();
  try {
    writeFileSync(join(dir,'metrics.json'), JSON.stringify({source:'private clients',summary:LOOKS.map(look=>({look}))}));
    assert.throws(() => makeBlindReview(dir),/Only real public-catalog GPU/);
    assert.equal(existsSync(join(dir,'blind-review.html')),false);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test('fails closed on missing screenshots, missing look and duplicate IDs', () => {
  const dir=inputDir();
  try {
    rmSync(join(dir,'icy-after.png'));
    assert.throws(() => makeBlindReview(dir),/Missing actual GPU/);
    writeFileSync(join(dir,'icy-after.png'),PNG_SIGNATURE);
    writeFileSync(join(dir,'metrics.json'), JSON.stringify({source:'public catalog only',summary:[{look:'icy'},{look:'icy'},{look:'cut-crease'}]}));
    assert.throws(() => makeBlindReview(dir),/three distinct diagnostic/);
    assert.equal(existsSync(join(dir,'blind-review.html')),false);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
