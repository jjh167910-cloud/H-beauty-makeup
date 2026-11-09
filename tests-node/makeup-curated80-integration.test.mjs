import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";

const source=path=>readFileSync(path,"utf8");
const records=path=>source(path).split("\n")
  .filter(line=>/^\s*\{"id":"(?:mk40|mk80)-/.test(line))
  .map(line=>JSON.parse(line.trim().replace(/,$/,"")));

test("exactly 80 source-numbered styles, stable image paths, unique IDs",()=>{
 const old=records("src/data/makeup-curated-40.ts");
 const added=records("src/data/makeup-curated-43-82.ts");
 assert.equal(old.length,40);assert.equal(added.length,40);
 const combined=[...old,...added];
 assert.equal(new Set(combined.map(x=>x.id)).size,80);
 assert.equal(new Set(combined.map(x=>x.promptNumber)).size,80);
 assert.equal(new Set(combined.map(x=>x.nameEn)).size,80);
 assert.deepEqual(old.map(x=>x.promptNumber),Array.from({length:41},(_,i)=>i+2).filter(n=>n!==7));
 assert.deepEqual(added.map(x=>x.promptNumber),Array.from({length:40},(_,i)=>i+43));
 for(const look of old){
   assert.match(look.image,/\/makeup\/curated-40\/mk40-\d{2}\.webp$/);
   assert.match(look.thumb,/\/makeup\/curated-40\/sm\/mk40-\d{2}\.webp$/);
 }
 for(const look of added){
   assert.equal(look.id,"mk80-"+look.promptNumber);
   assert.equal(look.code,"HB-"+look.promptNumber);
   assert.equal(look.image,"/makeup/curated-80/"+look.id+".webp");
   assert.equal(look.thumb,"/makeup/curated-80/sm/"+look.id+".webp");
   assert.ok(look.description.length>40);
 }
});

test("user-uploaded 43–82 portraits use their real ZIP filenames",()=>{
 const extra=records("src/data/makeup-curated-43-82.ts");
 const expected=new Map([
  [43,"Office Polished"],[57,"Silver Smokey"],[61,"Persian Kohl (Sormeh)"],
  [65,"Golden Bride"],[69,"Nowruz Fresh"],[70,"Yalda Night"],
  [71,"Chrome Lids"],[75,"Neon Graphic"],[80,"Igari"],
  [81,"Jirai Kei"],[82,"J-Beauty Coral"],
 ]);
 for(const [n,en] of expected)
  assert.equal(extra.find(x=>x.promptNumber===n)?.nameEn,en);
});

test("80 look integration preserves existing makeup list, booking sheet and favorites",()=>{
 const styles=source("src/data/makeup-styles.ts");
 const photos=source("src/data/makeup-photos.ts");
 const screen=source("src/components/salon/screens/makeup.tsx");
 const sheet=source("src/components/salon/sheets/makeup.tsx");
 const worker=source("scripts/finalize-service-worker.mjs");
 assert.match(styles,/const LEGACY_MAKEUP_STYLES/);
 assert.match(styles,/VITE_MAKEUP_CURATED_80 === "true"/);
 assert.match(styles,/LEGACY_MAKEUP_STYLES, \.\.\.CURATED_80_STYLES/);
 assert.match(photos,/export const MAKEUP_PHOTOS/);
 assert.match(photos,/curated-40/);
 assert.match(photos,/curated-80/);
 assert.match(screen,/mk-collection-switch/);
 assert.match(screen,/styleById\.get\(id\)/);
 assert.match(sheet,/mk-curated-save/);
 assert.match(sheet,/style\.promptNumber \? "full"/);
 assert.match(worker,/VITE_MAKEUP_CURATED_80/);
 assert.match(worker,/Missing curated makeup portrait/);
});

test("zip importer and deployment build are opt-in and integrity-pinned",()=>{
 const wrangler=source("wrangler.jsonc");
 const workflow=source(".github/workflows/deploy.yml");
 const pkg=JSON.parse(source("package.json"));
 assert.match(wrangler,/VITE_MAKEUP_CURATED_80/);
 // Production keeps the verified 80-photo edition; disabling it must
 // be an explicit build choice, not a silent response to preview failures.
 assert.match(wrangler,/VITE_MAKEUP_CURATED_80:-true/);
 assert.doesNotMatch(wrangler,/VITE_MAKEUP_CURATED_80:-false/);
 assert.match(wrangler,/npm run verify:makeup-curated-80/);
 assert.match(workflow,/HBEAUTY_CURATED_80/);
 assert.match(workflow,/Verify optional eighty-makeup edition/);
 assert.equal(pkg.scripts["prepare:makeup-curated-80"],"node scripts/import-makeup80-archive.mjs --if-present");
 assert.equal(pkg.scripts["verify:makeup-curated-80"],"node scripts/verify-curated-80.mjs");
 const lock=source("assets/hbeauty-makeup-80.sha256").split(/\s+/)[0];
 assert.match(lock,/^[a-f0-9]{64}$/);
});

test("archive importer parses on Node 22 and fails closed when the archive is absent",()=>{
 const syntax=spawnSync(process.execPath,["--check","scripts/import-makeup80-archive.mjs"],{encoding:"utf8"});
 assert.equal(syntax.status,0,syntax.stderr);
 const required=source("scripts/import-makeup80-archive.mjs");
 assert.match(required,/archive hash mismatch/);
 assert.match(required,/SHA256 mismatch/);
 assert.match(required,/unknown or duplicated image path/);
 assert.match(required,/Missing|missing/);
});
