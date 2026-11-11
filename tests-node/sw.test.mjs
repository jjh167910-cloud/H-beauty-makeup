import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { finalizeServiceWorker } from '../scripts/finalize-service-worker.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = readFileSync(join(ROOT, 'public/sw.js'), 'utf8');

function simulate(source = TEMPLATE, fetcher = async () => { throw new Error('offline'); }) {
  const handlers = new Map(), stores = new Map(), deleted = [];
  const normalize=req => new URL(typeof req==='string'?req:req.url,'https://salon.test').pathname;
  const CACHE = source.match(/const CACHE='([^']+)'/)?.[1];
  const caches = {
    open: async name => {
      if (!stores.has(name)) stores.set(name,new Map());
      const entries=stores.get(name);
      return {
        addAll: async urls => { for(const path of urls) entries.set(path,{ok:true,body:path}); },
        put: async (req,res) => entries.set(normalize(req),res),
        match: async req => entries.get(normalize(req)),
      };
    },
    keys: async () => [...stores.keys()],
    delete: async name => { deleted.push(name);return stores.delete(name); },
    match: async req => {
      const path=normalize(req);
      for(const entries of stores.values()) if(entries.has(path))return entries.get(path);
    },
  };
  const fetch = fetcher;
  const self = {
    location:{origin:'https://salon.test'},
    addEventListener:(name,handler)=>handlers.set(name,handler),
    skipWaiting:async()=>{}, clients:{claim:async()=>{}},
  };
  runInNewContext(source,{self,caches,fetch,console,URL,Promise});
  const trigger=(kind,request)=>{
    let response;
    handlers.get(kind)({request,waitUntil:p=>response=p,respondWith:p=>response=p});
    return response;
  };
  return {CACHE,deleted,stores,trigger};
}

test('installer caches HTML, manifest and vector/raster brand assets',async()=>{
  const app=simulate();await app.trigger('install');
  for(const path of ['/','/index.html','/manifest.webmanifest',
    '/icons/hananeh-signature.svg','/icons/icon-192.png','/icons/icon-512.png',
    '/icons/apple-touch-icon.png'])assert.ok(app.stores.get(app.CACHE).has(path),path);
});

test('activation preserves the last app release while clearing older and unrelated caches',async()=>{
  const app=simulate();
  app.stores.set('h-beauty-v3',new Map([['/assets/very-old.js',{body:'too old'}]]));
  app.stores.set('h-beauty-v4',new Map([['/assets/old.js',{body:'previous app'}],['/index.html',{body:'old HTML'}]]));
  app.stores.set('other-project-data',new Map());
  await app.trigger('install');await app.trigger('activate');
  assert.equal(app.stores.has('h-beauty-v3'),false);
  assert.equal(app.stores.has('h-beauty-v4'),true);
  assert.equal(app.stores.has('other-project-data'),true);
  assert.equal(app.stores.has(app.CACHE),true);
  const previousAsset=await app.trigger('fetch', {
    method:'GET',url:'https://salon.test/assets/old.js',mode:'cors',
  });
  assert.equal(previousAsset.body,'previous app');
  const offlineShell=await app.trigger('fetch', {
    method:'GET',url:'https://salon.test/?look=cat-eye',mode:'navigate',
  });
  assert.equal(offlineShell.body,'/index.html');
});

test('online navigation never swaps a newer HTML into the cached JS version',async()=>{
  const app=simulate(TEMPLATE, async () => ({ok:true,body:'newer deployment'}));
  await app.trigger('install');
  const fresh=await app.trigger('fetch', {
    method:'GET',url:'https://salon.test/?look=cat-eye',mode:'navigate',
  });
  assert.equal(fresh.body,'newer deployment');
  assert.equal(app.stores.get(app.CACHE).get('/index.html').body,'/index.html');
});

test('offline navigation returns cached application HTML',async()=>{
  const app=simulate();await app.trigger('install');
  const result=await app.trigger('fetch',{
    method:'GET',url:'https://salon.test/?look=cat-eye',mode:'navigate',
  });
  assert.equal(result.body,'/index.html');
});

function fixture(testBody) {
  const folder=mkdtempSync(join(tmpdir(),'hananeh-offline-'));
  mkdirSync(join(folder,'assets'));
  const put=(path,bytes)=>writeFileSync(join(folder,path),bytes);
  put('index.html','<html><script type="module" src="/assets/app.js"></script></html>');
  put('sw.js',TEMPLATE);
  put('assets/app.js','console.log("beauty")');
  put('assets/style.css','body{direction:rtl}');
  put('assets/font.woff2','dummy-font');
  try{return testBody({folder,put});}finally{rmSync(folder,{recursive:true,force:true});}
}

test('production finalizer explicitly precaches compiled JS, CSS and fonts',async()=>fixture(async({folder})=>{
  const output=finalizeServiceWorker(folder);
  assert.ok(output.version.startsWith('h-beauty-v5-'));
  for(const url of ['/assets/app.js','/assets/style.css','/assets/font.woff2'])
    assert.ok(output.urls.includes(url),url);
  assert.ok(!output.urls.some(path=>path.startsWith('/tryon/')));
  const app=simulate(readFileSync(join(folder,'sw.js'),'utf8'));
  await app.trigger('install');
  for(const url of output.urls){
    assert.ok(app.stores.get(app.CACHE).has(url),url);
    const response=await app.trigger('fetch',{method:'GET',url:'https://salon.test'+url,mode:'cors'});
    assert.equal(response.body,url);
  }
}));

test('new asset content creates a distinct cache version',()=>fixture(({folder,put})=>{
  const first=finalizeServiceWorker(folder).version;
  put('assets/app.js','console.log("new release")');
  put('sw.js',TEMPLATE);
  const second=finalizeServiceWorker(folder).version;
  assert.notEqual(first,second);
}));

test('production finalizer fails closed without build placeholders',()=>fixture(({folder,put})=>{
  put('sw.js','const CACHE="not-a-real-template"');
  assert.throws(()=>finalizeServiceWorker(folder),/placeholders/);
}));

test('AI try-on files come from their own long-lived cache and are not copied per release',async()=>{
  const fetched=[];
  const app=simulate(TEMPLATE, async req => { fetched.push(new URL(req.url).pathname); return {ok:true,type:'basic',body:'network',clone(){return this;}}; });
  await app.trigger('install');await app.trigger('activate');
  app.stores.set('hb-ai-models-v2',new Map([['/tryon/tiny/hollywood.onnx',{body:'model from AI cache'}]]));
  const model=await app.trigger('fetch',{method:'GET',url:'https://salon.test/tryon/tiny/hollywood.onnx',mode:'cors'});
  assert.equal(model.body,'model from AI cache');
  const glue=await app.trigger('fetch',{method:'GET',url:'https://salon.test/tryon/ort/ort-wasm-simd-threaded.mjs',mode:'cors'});
  assert.equal(glue.body,'network');
  assert.deepEqual(fetched,['/tryon/ort/ort-wasm-simd-threaded.mjs']);
  assert.equal(app.stores.get(app.CACHE).has('/tryon/ort/ort-wasm-simd-threaded.mjs'),false);
  // A new release clears old app caches but never the downloaded AI files.
  app.stores.set('h-beauty-v1',new Map());app.stores.set('h-beauty-v2',new Map());
  await app.trigger('activate');
  assert.equal(app.stores.has('hb-ai-models-v2'),true);
});

test('look photos saved with the AI download are served offline, even after a new release',async()=>{
  const app=simulate();
  await app.trigger('install');await app.trigger('activate');
  app.stores.set('hb-ai-models-v2',new Map([['/makeup/looks/sm/twenties.webp',{body:'thumb from AI cache'}]]));
  app.stores.set('h-beauty-v1',new Map());app.stores.set('h-beauty-v2',new Map());
  await app.trigger('activate');
  const thumb=await app.trigger('fetch',{method:'GET',url:'https://salon.test/makeup/looks/sm/twenties.webp',mode:'no-cors'});
  assert.equal(thumb.body,'thumb from AI cache');
});

test('a new release drops the files of the earlier AI try-on engine but keeps the current ones',async()=>{
  const app=simulate();
  app.stores.set('hb-ai-models-v1',new Map([['/tryon/elegant-v1.onnx',{body:'old 21 MB model'}]]));
  app.stores.set('hb-ai-models-v2',new Map([['/tryon/tiny/hollywood.onnx',{body:'tiny model'}]]));
  await app.trigger('install');await app.trigger('activate');
  assert.equal(app.stores.has('hb-ai-models-v1'),false);
  assert.equal(app.stores.has('hb-ai-models-v2'),true);
});
