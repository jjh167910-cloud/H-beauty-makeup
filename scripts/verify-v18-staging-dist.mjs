import { readFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const expected=JSON.parse(readFileSync('v18-pwa-file-manifest.json','utf8'));
if(expected.file_count!==974 || expected.files.length!==974)
  throw new Error('V18 asset manifest incomplete');
for(const f of expected.files){
  if(!f.path || f.path.startsWith('/') || f.path.split('/').includes('..'))
    throw new Error('Invalid V18 relative asset path');
  const name=resolve('pwa-v18',f.path);
  if(!existsSync(name) || statSync(name).size!==f.size)
    throw new Error('Missing/modified V18 asset '+f.path);
  const digest=createHash('sha256').update(readFileSync(name)).digest('hex');
  if(digest!==f.sha256)throw new Error('Hash mismatch '+f.path);
}
const cfg=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
if(cfg.name!=='h-beauty-makeup' || cfg.assets.directory!=='./pwa-v18')
  throw new Error('Production worker target forbidden');
console.log('PASS: 974 original V18 files verified with SHA-256; staging Worker name is h-beauty-makeup');
