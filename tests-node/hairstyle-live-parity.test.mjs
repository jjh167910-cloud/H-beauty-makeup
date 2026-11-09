import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyLiveHairstyleAssets } from '../scripts/verify-live-hairstyle-ivory.mjs';

const bytes = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(16)]);
const digest = createHash('sha256').update(bytes).digest('hex');
const item = { id: 1, thumb: true, rel: 'looks/sm/1.webp', sha256: digest, length: bytes.length };

test('live hairstyle parity verifies exact WebP bytes and a revision query', async () => {
  let requested;
  const result = await verifyLiveHairstyleAssets([item], {
    base: 'https://h-beauty.example', revision: 'test-sha', retryDelayMs: 0,
    fetcher: async (url, options) => {
      requested = { url, options };
      return new Response(bytes, { status: 200 });
    }
  });
  assert.equal(result.checked, 1);
  assert.equal(result.bytes, bytes.length);
  assert.equal(new URL(requested.url).searchParams.get('release-proof'), 'test-sha-1');
  assert.equal(requested.options.headers['Cache-Control'], 'no-cache');
});

test('live hairstyle parity rejects old or modified image bytes', async () => {
  const stale = Buffer.from(bytes);
  stale[15] ^= 1;
  await assert.rejects(() => verifyLiveHairstyleAssets([item], {
    base: 'https://h-beauty.example', attempts: 2, retryDelayMs: 0,
    fetcher: async () => new Response(stale, { status: 200 })
  }), /SHA-256 mismatch/);
});

test('live hairstyle parity rejects missing images and HTML SPA fallbacks', async () => {
  await assert.rejects(() => verifyLiveHairstyleAssets([item], {
    base: 'https://h-beauty.example', attempts: 1, retryDelayMs: 0,
    fetcher: async () => new Response('<html>missing</html>', { status: 200 })
  }), /Wrong byte size or image type/);
  await assert.rejects(() => verifyLiveHairstyleAssets([item], {
    base: 'https://h-beauty.example', attempts: 1, retryDelayMs: 0,
    fetcher: async () => new Response('', { status: 404 })
  }), /HTTP 404/);
});
