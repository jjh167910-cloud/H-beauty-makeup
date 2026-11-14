/** Post-Vite build: package the offline app shell (dist/assets). The try-on's AI files (/tryon/) are not part of it:
 * they have their own cache, filled by the app's one-time download.
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
  // Offline install must preload the static entry graph and its immediately
  // rendered try-on screen, but not deeper optional AI/photo-editing chunks.
  // Optional chunks are runtime cached when used.
  const fileByUrl=new Map(files.map(file=>['/'+relative(root,file).split(sep).join('/'),file]));
  const shell=new Set();
  const canonical=(spec,from='/index.html')=>{
    if(/^(?:data:|blob:|https?:)/i.test(spec))return null;
    try{return new URL(spec,'https://h-beauty.invalid'+from).pathname;}catch{return null;}
  };
  const add=(spec,from)=>{
    const path=canonical(spec,from);
    if(!path||!fileByUrl.has(path)||shell.has(path))return;
    shell.add(path);
    if(!/\.(?:js|css)$/i.test(path))return;
    const code=readFileSync(fileByUrl.get(path),'utf8');
    if(path.endsWith('.css')){
      // CSS url() references its own font/image assets. Imported CSS was
      // consolidated by Vite, but follow it too if present.
      for(const m of code.matchAll(/url\(\s*["']?([^"'()]+)["']?\s*\)/g))add(m[1].trim(),path);
      for(const m of code.matchAll(/@import\s+["']([^"']+)["']/g))add(m[1],path);
    }else{
      // Match both readable and Vite-minified ES module syntax:
      // import{a}from"./x.js", export{a}from"./x.js" and import"./x.js".
      // Anchoring to statement boundaries avoids including import("./lazy.js").
      const staticFrom=/(?:^|[;\n])\s*(?:import|export)\s*(?:\{[^{}]*\}|\*\s*(?:as\s*[\w$]+)?|[\w$]+(?:\s*,\s*\{[^{}]*\})?)\s*from\s*["']([^"']+)["']/g;
      const sideEffect=/(?:^|[;\n])\s*import\s*["']([^"']+)["']/g;
      for(const m of code.matchAll(staticFrom))add(m[1],path);
      for(const m of code.matchAll(sideEffect))add(m[1],path);
    }
  };
  const htmlContent=readFileSync(html,'utf8');
  const entryJs=[];
  for(const tag of htmlContent.matchAll(/<(?:script|link)\b[^>]*>/gi)){
    for(const attribute of tag[0].matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)){
      add(attribute[1],'/index.html');
      // The root screen immediately renders the lazy TryOnView, sometimes
      // BEFORE the service worker controls the first page load. Its compiled
      // chunk must be installed proactively or offline reopening can fail.
      if(/^<script\b/i.test(tag[0])){
        const entry=canonical(attribute[1],'/index.html');
        if(entry?.endsWith('.js')&&fileByUrl.has(entry))entryJs.push(entry);
      }
    }
  }
  for(const entry of entryJs){
    const code=readFileSync(fileByUrl.get(entry),'utf8');
    for(const m of code.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g))
      add(m[1],entry);
  }
  const urls=[...shell].sort();
  if(!urls.some(url=>url.endsWith('.js'))||!urls.some(url=>url.endsWith('.css')))
    throw new Error('HTML entrypoint must reference built JavaScript and CSS to guarantee offline startup');
  const total=urls.reduce((sum,url)=>sum+statSync(fileByUrl.get(url)).size,0);
  if(total>LIMIT)throw new Error(`Offline app shell ${(total/1048576).toFixed(1)} MiB exceeds 35 MiB budget`);
  const hash=createHash('sha256').update(htmlContent);
  // Fingerprint *all* compiled assets, including lazy chunks: changing any
  // chunk still updates the cache version and prevents cross-release mixing.
  for(const file of files)hash.update('/'+relative(root,file).split(sep).join('/')).update(readFileSync(file));
  const version=`h-beauty-v5-${hash.digest('hex').slice(0,12)}`;
  const source=readFileSync(worker,'utf8');
  if(!source.includes(CACHE_TOKEN) || !source.includes(ASSET_TOKEN))
    throw new Error('Worker lacks required build placeholders; refusing unversioned offline release');
  const output=source.replace(CACHE_TOKEN,`const CACHE='${version}';`)
    .replace(ASSET_TOKEN,`const BUILD_ASSETS=${JSON.stringify(urls)};`);
  writeFileSync(worker,output);
  console.log(`Offline shell: ${urls.length}/${files.length} built assets, ${(total/1048576).toFixed(2)} MiB, cache ${version}`);
  return { version, urls, bytes:total };
}

if(process.argv[1]?.endsWith('finalize-service-worker.mjs')) {
  const i=process.argv.indexOf('--dist');
  finalizeServiceWorker(i>=0 ? process.argv[i+1] : 'dist');
}
