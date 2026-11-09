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
  const normalize=req => {const url=new URL(typeof req==='string'?req:req.url,'https://salon.test');return url.pathname+url.search;};
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
    method:'GET',url:'https://salon.test/#/looks',mode:'navigate',
  });
  assert.equal(offlineShell.body,'/index.html');
});

test('online navigation never swaps a newer HTML into the cached JS version',async()=>{
  const app=simulate(TEMPLATE, async () => ({ok:true,body:'newer deployment'}));
  await app.trigger('install');
  const fresh=await app.trigger('fetch', {
    method:'GET',url:'https://salon.test/#/looks',mode:'navigate',
  });
  assert.equal(fresh.body,'newer deployment');
  assert.equal(app.stores.get(app.CACHE).get('/index.html').body,'/index.html');
});

test('offline navigation returns cached application HTML',async()=>{
  const app=simulate();await app.trigger('install');
  const result=await app.trigger('fetch',{
    method:'GET',url:'https://salon.test/#/looks',mode:'navigate',
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
  assert.ok(!output.urls.some(path=>path.startsWith('/looks/')));
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


test('review JSON ignores stale cached pre-Persian metadata while online',async()=>{
  const fresh={ok:true,type:'basic',body:'{"files":[{"title":"باغ زیتونی"}]}',
    clone(){return this;}};
  const app=simulate(TEMPLATE,async(request,options)=>{
    assert.equal(options.cache,'no-store');
    assert.ok(request.url.includes('/review/manifest-146.json'));
    return fresh;
  });
  await app.trigger('install');
  app.stores.get(app.CACHE).set('/review/manifest-146.json',{ok:true,body:'{"files":[{"id":"old"}]}'});
  const result=await app.trigger('fetch',{
    method:'GET',url:'https://salon.test/review/manifest-146.json',mode:'cors'
  });
  assert.equal(result.body,fresh.body);
  assert.equal(app.stores.get(app.CACHE).get('/review/manifest-146.json').body,fresh.body);
});

test('review JSON returns cached metadata if offline, without discarding local work',async()=>{
  const app=simulate(TEMPLATE,async()=>{throw Error('offline');});
  await app.trigger('install');
  const previous={ok:true,body:'{"files":[{"id":"nail-example"}]}'};
  app.stores.get(app.CACHE).set('/review/manifest-146.json',previous);
  const result=await app.trigger('fetch',{
    method:'GET',url:'https://salon.test/review/manifest-146.json',mode:'cors'
  });
  assert.equal(result.body,previous.body);
});

test('review title changes must rotate PWA cache without altering photo assets',()=>{
  fixture(({folder,put})=>{
    const suggestions=JSON.parse(readFileSync(join(ROOT,
      'public/review/manicure-146-preliminary-suggestions.json'),'utf8'));
    assert.equal(suggestions.images.length,146);
    mkdirSync(join(folder,'review'));
    const manifest={schema:2,count:146,approval:'NOT_GRANTED',
      files:suggestions.images.map(item=>({
        id:item.id,title:item.catalog.title,en:item.catalog.en,
        sha:'a'.repeat(64)
      }))};
    put('review/manifest-146.json',JSON.stringify(manifest));
    put('review/manicure-146-preliminary-suggestions.json',JSON.stringify(suggestions));
    put('review/manicure-intake.html','<html lang="fa">review</html>');
    put('review/editorial-workspace.html','<html lang="fa">editorial</html>');
    const old=finalizeServiceWorker(folder);
    for(const path of ['/review/manifest-146.json',
      '/review/manicure-146-preliminary-suggestions.json',
      '/review/manicure-intake.html','/review/editorial-workspace.html'])
      assert.ok(old.urls.includes(path),'not precached: '+path);
    manifest.files[0].title='عنوان آزمایشی جدید';
    suggestions.images[0].catalog.title='عنوان آزمایشی جدید';
    put('review/manifest-146.json',JSON.stringify(manifest));
    put('review/manicure-146-preliminary-suggestions.json',JSON.stringify(suggestions));
    put('sw.js',TEMPLATE);
    const next=finalizeServiceWorker(folder);
    assert.notEqual(next.version,old.version,
      'Persian title changed but cached review metadata version did not rotate');
    put('sw.js',TEMPLATE);
    manifest.files[0].title='عنوان اشتباه';
    put('review/manifest-146.json',JSON.stringify(manifest));
    assert.throws(()=>finalizeServiceWorker(folder),/Persian photo names differ/);
  });
});

test('versioned review metadata uses precached unversioned copy when offline',async()=>{
  const app=simulate(TEMPLATE,async()=>{throw Error('offline');});
  await app.trigger('install');
  const saved={ok:true,body:'146 pre-cached records'};
  app.stores.get(app.CACHE).set('/review/manifest-146.json',saved);
  const response=await app.trigger('fetch',{
    method:'GET',url:'https://salon.test/review/manifest-146.json?release=persian-146-cachefix-20261030',
    mode:'cors'
  });
  assert.equal(response.body,saved.body);
});

test('offline reviewer navigations use the precached reviewer HTML, not the SPA shell',async()=>{
  const app=simulate(TEMPLATE,async()=>{throw Error('offline');});
  await app.trigger('install');
  for(const path of ['/review/manicure-intake.html','/review/editorial-workspace.html']){
    app.stores.get(app.CACHE).set(path,{ok:true,body:'review page: '+path});
    const response=await app.trigger('fetch',{
      method:'GET',url:'https://salon.test'+path,mode:'navigate'
    });
    assert.equal(response.body,'review page: '+path);
  }
  const spa=await app.trigger('fetch',{
    method:'GET',url:'https://salon.test/#/looks',mode:'navigate'
  });
  assert.equal(spa.body,'/index.html');
});
