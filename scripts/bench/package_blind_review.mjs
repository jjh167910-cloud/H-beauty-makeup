/**
 * Package the already-validated public GPU blind review into one offline HTML.
 *
 * The CI GPU test must have completed its safety assertions before producing
 * this directory. This packager does not alter or synthesize pixels: PNG bytes
 * are embedded verbatim as data URIs. No private photo may be included.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const LOOKS = ['icy', 'mod-60s', 'cut-crease'];
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MARKER = "  const looks = ['icy', 'mod-60s', 'cut-crease'];";
const OLD_A = "    byId('imgA').src = trial.look + '-' + trial.roleA + '.png';";
const OLD_B = "    byId('imgB').src = trial.look + '-' + trial.roleB + '.png';";

function replaceExactlyOnce(source, from, to) {
  if (source.indexOf(from) < 0 || source.indexOf(from, source.indexOf(from) + 1) >= 0)
    throw new Error('Unexpected blind review template; exact unique marker missing');
  return source.replace(from, to);
}

function readValidatedPng(path) {
  const bytes = readFileSync(path);
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE))
    throw new Error('Expected a nonempty actual PNG frame: ' + path);
  if (bytes.toString('ascii', 12, 16) !== 'IHDR')
    throw new Error('Actual PNG frame lacks IHDR metadata: ' + path);
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (width < 256 || height < 256 || width > 8192 || height > 8192)
    throw new Error('Unexpected GPU reference frame dimensions: ' + path);
  return {
    width, height,
    uri: 'data:image/png;base64,' + bytes.toString('base64'),
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

export function packageBlindReview(directory) {
  const input = JSON.parse(readFileSync(join(directory, 'metrics.json'), 'utf8'));
  if (input.source !== 'public catalog only' || input.fullCatalog !== false ||
      !Array.isArray(input.summary) || input.summary.length !== LOOKS.length ||
      new Set(input.summary.map(x => x.look)).size !== LOOKS.length ||
      LOOKS.some(id => !input.summary.some(x => x.look === id)))
    throw new Error('Only three public-only, paired GPU looks may be packaged');
  const metricsSafe = input.summary.every(x =>
    Number.isFinite(x.baselineLstar) &&
    Number.isFinite(x.candidateLstar) &&
    x.baselineRepeatedSafeHash === true &&
    Math.abs(x.baselineLstar - x.repeatLstar) < 0.01 &&
    x.candidateLstar >= x.baselineLstar - 0.2 &&
    x.pixels?.lipPixels === 0 &&
    x.pixels?.outsideFace <= 64 &&
    x.pixels?.outsideBoxes <= 32 &&
    x.pixels?.outsideFaceOverOne === 0 &&
    x.pixels?.outsideBoxOverOne === 0
  );
  if (!metricsSafe)
    throw new Error('GPU metrics lack proof that the actual A/B safety checks passed');

  const frames = {};
  const hashes = {};
  for (const look of LOOKS) {
    const a = readValidatedPng(join(directory, look + '-before.png'));
    const b = readValidatedPng(join(directory, look + '-after.png'));
    if (a.width !== b.width || a.height !== b.height)
      throw new Error('Paired GPU screenshot dimensions differ for ' + look);
    frames[look + '-before.png'] = a.uri;
    frames[look + '-after.png'] = b.uri;
    hashes[look] = { before: a.sha256, after: b.sha256, width: a.width, height: a.height };
  }

  let html = readFileSync(join(directory, 'blind-review.html'), 'utf8');
  if (!html.includes('hbeauty-public-blind-review-v1') ||
      /<script[^>]+src=|https?:\/\/|XMLHttpRequest|sendBeacon|localStorage/i.test(html))
    throw new Error('Refusing blind-review page with unexpected remote dependencies');
  html = replaceExactlyOnce(html, MARKER,
    MARKER + '\n  const embeddedImages = ' + JSON.stringify(frames) + ';');
  html = replaceExactlyOnce(html, OLD_A,
    "    byId('imgA').src = embeddedImages[trial.look + '-' + trial.roleA + '.png'];");
  html = replaceExactlyOnce(html, OLD_B,
    "    byId('imgB').src = embeddedImages[trial.look + '-' + trial.roleB + '.png'];");
  const output = join(directory, 'blind-review-standalone.html');
  writeFileSync(output, html);
  writeFileSync(join(directory, 'standalone-integrity.json'), JSON.stringify({
    schema: 'hbeauty-public-standalone-v1',
    source: 'public catalog only',
    looks: LOOKS,
    originalPngSha256: hashes,
  }, null, 2));
  return { output, frameCount: 6, bytes: Buffer.byteLength(html) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const directory = process.argv[2];
  if (!directory) throw new Error('Usage: node package_blind_review.mjs <validated-public-gallery-dir>');
  console.log(JSON.stringify(packageBlindReview(directory)));
}
