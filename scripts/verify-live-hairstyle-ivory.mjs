/**
 * H-Beauty full hairstyle release parity.
 * Build-time input archives are SHA256-verified by install-hairstyle-ivory.mjs.
 * This checks every installed original/thumbnail against the built release,
 * then all 584 public Worker image responses against the identical local bytes.
 * Binary parity is not a substitute for subjective hair-edge/portrait review.
 *
 * node scripts/verify-live-hairstyle-ivory.mjs --local
 * node scripts/verify-live-hairstyle-ivory.mjs --live
 */
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { getHairIvoryConfig } from './install-hairstyle-ivory.mjs';
import { webpDimensions } from './audit-nail-photo-candidates.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const isWebP = bytes => bytes.length >= 20 &&
  bytes.toString('ascii', 0, 4) === 'RIFF' &&
  bytes.toString('ascii', 8, 12) === 'WEBP';

export function loadHairstyleReleaseAssets({ dist = 'dist', source = 'public' } = {}) {
  const manifest = getHairIvoryConfig();
  // The exact owner-supplied HB-001 image is a genuine 1536px source; unlike
  // the other 291 derived 2048px presentation images it is NOT upscaled.
  // Require its two independently locked bytes when the overlay is installed.
  const overlayFile = resolve('assets/hb001-overlay.sha256');
  let hb001Digests = null;
  if (existsSync(overlayFile)) {
    const expectedFull='f94145d96dc9c4aca28674b704b7ee61b09564015dbd118d502f060b6d3d5818';
    const expectedThumb='19b999364c0717576da9eb7cdcec3e372b8d90df4104847711f04553dd05cf52';
    const locked=readFileSync(overlayFile,'utf8');
    if (locked !== expectedFull+'  1.webp\n'+expectedThumb+'  1-thumb.webp\n')
      throw Error('Unknown HB-001 overlay release');
    hb001Digests={full:expectedFull,thumb:expectedThumb};
  }
  const items = [];
  for (let id = 1; id <= manifest.count; id++) {
    for (const thumb of [false, true]) {
      const rel = 'looks/' + (thumb ? 'sm/' : '') + id + '.webp';
      const built = resolve(dist, rel);
      const installed = resolve(source, rel);
      if (!existsSync(built) || !existsSync(installed))
        throw Error('Missing source/build hairstyle image: ' + rel);
      const bytes = readFileSync(built);
      if (bytes.length < 2000 || bytes.length > 1_800_000 || !isWebP(bytes))
        throw Error('Invalid release WebP: ' + rel);
      const dimensions = webpDimensions(bytes);
      const expectedSize = thumb ? 560 : (id === 1 && hb001Digests ? 1536 : 2048);
      if (dimensions.width !== expectedSize || dimensions.height !== expectedSize)
        throw Error('Wrong hairstyle dimensions ' + rel + ': ' + dimensions.width + 'x' + dimensions.height);
      const digest = sha256(bytes);
      if (id === 1 && hb001Digests &&
          digest !== (thumb ? hb001Digests.thumb : hb001Digests.full))
        throw Error('HB-001 portrait differs from owner-selected release SHA: '+rel);
      if (sha256(readFileSync(installed)) !== digest)
        throw Error('Published image differs from installed locked asset: ' + rel);
      items.push({ id, thumb, rel, sha256: digest, length: bytes.length });
    }
  }
  if (items.length !== manifest.assetCount)
    throw Error('Incomplete built hairstyle image release');
  return items;
}

export async function verifyLiveHairstyleAssets(items, {
  base = process.env.HBEAUTY_PUBLIC_URL || 'https://h-beauty.mostifa2273.workers.dev',
  revision = process.env.GITHUB_SHA || 'release',
  concurrency = 8,
  attempts = 3,
  fetcher = fetch,
  retryDelayMs = 2000
} = {}) {
  if (!items.length || !Number.isInteger(concurrency) || concurrency < 1 ||
      !Number.isInteger(attempts) || attempts < 1)
    throw Error('Invalid hairstyle release verifier input');
  const origin = new URL(base);
  if (origin.protocol !== 'https:' && origin.hostname !== 'localhost')
    throw Error('A secure production origin is required');
  if (origin.pathname !== '/' || origin.search || origin.hash)
    throw Error('Production origin must not include a path or query');
  const failures = [];
  let next = 0;
  let passed = 0;
  let transferredBytes = 0;
  const verifyOne = async () => {
    while (next < items.length) {
      const item = items[next++];
      let lastError;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          const url = new URL('/' + item.rel, origin);
          url.searchParams.set('release-proof', revision + '-' + attempt);
          const response = await fetcher(url.toString(), {
            headers: { 'Cache-Control': 'no-cache' },
            signal: AbortSignal.timeout(30_000)
          });
          if (!response.ok) throw Error('HTTP ' + response.status);
          const bytes = Buffer.from(await response.arrayBuffer());
          if (bytes.length !== item.length || !isWebP(bytes))
            throw Error('Wrong byte size or image type (' + bytes.length + ' instead of ' + item.length + ')');
          const got = sha256(bytes);
          if (got !== item.sha256) throw Error('SHA-256 mismatch ' + got);
          passed++;
          transferredBytes += bytes.length;
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          if (attempt < attempts && retryDelayMs)
            await new Promise(done => setTimeout(done, retryDelayMs));
        }
      }
      if (lastError) failures.push(item.rel + ': ' + String(lastError));
    }
  };
  await Promise.all(Array.from({ length: Math.min(items.length, concurrency) }, verifyOne));
  if (failures.length)
    throw Error('Live hairstyle asset parity failed: ' + failures.length + '/' + items.length +
      '\n' + failures.slice(0, 30).join('\n'));
  return { checked: passed, bytes: transferredBytes };
}

if (process.argv[1]?.endsWith('verify-live-hairstyle-ivory.mjs')) {
  const mode = process.argv.includes('--live') ? 'live' :
    process.argv.includes('--local') ? 'local' : null;
  if (!mode) throw Error('Use --local or --live');
  const items = loadHairstyleReleaseAssets();
  console.log('Verified ' + items.length + ' delivered WebPs (292 originals + 292 thumbs; see release manifest for native source dimensions)');
  if (mode === 'live') {
    const result = await verifyLiveHairstyleAssets(items);
    console.log('Verified all public hairstyle images byte-for-byte', result);
  }
}
