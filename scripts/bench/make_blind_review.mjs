/** Offline human-feedback page for public-catalog actual GPU before/after images. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LOOKS = ['icy', 'mod-60s', 'cut-crease'];
const TEMPLATE = fileURLToPath(new URL('./blind-review.template.html', import.meta.url));

export function makeBlindReview(dir) {
  const data = JSON.parse(readFileSync(join(dir, 'metrics.json'), 'utf8'));
  if (data.source !== 'public catalog only' || !Array.isArray(data.summary))
    throw new Error('Only real public-catalog GPU evidence may enter the blinded review');
  const ids = data.summary.map(x => x.look);
  if (ids.length !== LOOKS.length || new Set(ids).size !== LOOKS.length ||
      LOOKS.some(look => !ids.includes(look)))
    throw new Error('Expected exactly three distinct diagnostic public looks');
  for (const look of LOOKS)
    for (const suffix of ['before', 'after'])
      if (!existsSync(join(dir, look + '-' + suffix + '.png')))
        throw new Error('Missing actual GPU ' + suffix + ' screenshot for ' + look);
  // The template uses only hard-coded public IDs and relative paths; no source
  // data, names or comments are inserted into executable HTML or remote code.
  const html = readFileSync(TEMPLATE, 'utf8');
  if (!html.includes('hbeauty-public-blind-review-v1') ||
      !html.includes("const looks = ['icy', 'mod-60s', 'cut-crease'];"))
    throw new Error('Blind review template version/catalog mismatch');
  writeFileSync(join(dir, 'blind-review.html'), html);
  return { looks: LOOKS.length, output: join(dir, 'blind-review.html') };
}
