/** Post-Vite build: package the offline React shell but NOT the hairstyle collection.
 * Run: node scripts/finalize-service-worker.mjs [--dist /path/to/dist]. */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const CACHE_TOKEN = "const CACHE='h-beauty-v5-unbuilt';";
const ASSET_TOKEN = 'const BUILD_ASSETS=[]; /* __H_BEAUTY_PRECACHE__ */';
const ALLOWED = /\.(?:js|css|woff2?|ttf|otf|svg|png|jpe?g|webp|avif)$/i;
const LIMIT = 35 * 1024 * 1024;

export function finalizeServiceWorker(distDir = 'dist') {
  const root=resolve(distDir);
  const html=join(root,'index.html');
  const worker=join(root,'sw.js');
  if (!existsSync(html) || !existsSync(worker))
    throw new Error(`Vite build missing index.html or sw.js in ${root}`);
  const files=[];
  function scan(dir) {
    if (!existsSync(dir)) throw new Error(`Missing built assets directory: ${dir}`);
    for(const item of readdirSync(dir,{withFileTypes:true})) {
      const full=join(dir,item.name);
      if(item.isDirectory()) scan(full);
      else if(item.isFile() && ALLOWED.test(item.name)) files.push(full);
    }
  }
  scan(join(root,'assets'));
  files.sort();
  if (!files.some(file => file.endsWith('.js')) || !files.some(file => file.endsWith('.css')))
    throw new Error('Built app must contain JavaScript and CSS in dist/assets');
  const total=files.reduce((sum,file)=>sum+statSync(file).size,0);
  if (total>LIMIT) throw new Error(`Offline app shell ${(total/1048576).toFixed(1)} MiB exceeds 35 MiB budget`);
  const urls=files.map(file=>'/'+relative(root,file).split(sep).join('/'));
  const hash=createHash('sha256').update(readFileSync(html));
  for(let i=0;i<files.length;i++) hash.update(urls[i]).update(readFileSync(files[i]));
  const version=`h-beauty-v5-${hash.digest('hex').slice(0,12)}`;
  const source=readFileSync(worker,'utf8');
  if(!source.includes(CACHE_TOKEN) || !source.includes(ASSET_TOKEN))
    throw new Error('Worker lacks required build placeholders; refusing unversioned offline release');
  const output=source.replace(CACHE_TOKEN,`const CACHE='${version}';`)
    .replace(ASSET_TOKEN,`const BUILD_ASSETS=${JSON.stringify(urls)};`);
  writeFileSync(worker,output);
  console.log(`Offline shell: ${urls.length} built assets, ${(total/1048576).toFixed(2)} MiB, cache ${version}`);
  return { version, urls, bytes:total };
}

if(process.argv[1]?.endsWith('finalize-service-worker.mjs')) {
  const i=process.argv.indexOf('--dist');
  finalizeServiceWorker(i>=0 ? process.argv[i+1] : 'dist');
}
