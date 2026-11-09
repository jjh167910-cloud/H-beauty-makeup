import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {createHash} from "node:crypto";
import {webpDimensions} from "../scripts/audit-nail-photo-candidates.mjs";
const approved=new Set(["nail-atlas-gradient-merlot","nail-atlas-prism-blush","nail-atlas-prism-champagne","nail-atlas-prism-coral","nail-atlas-prism-midnight","nail-atlas-prism-pearl","nail-atlas-prism-sage","nail-atlas-velvet-blush","nail-atlas-velvet-coral","nail-atlas-velvet-midnight"]);
const lines=readFileSync("assets/hbeauty-manicure-batch50-a.sha256","utf8").trim().split(/\r?\n/);
test("Batch 50 review publishes only ten individually selected original photos",()=>{
  assert.equal(lines.length,10);
  const names=new Set(),hashes=new Set();
  for(const line of lines){
    const m=line.match(/^([a-f0-9]{64})  (public\/nails\/photos\/(nail-[a-z0-9-]+)\.webp)$/);
    assert.ok(m,"Invalid release lock");assert.ok(approved.has(m[3]));
    assert.ok(!names.has(m[3]));assert.ok(!hashes.has(m[1]));
    names.add(m[3]);hashes.add(m[1]);assert.ok(existsSync(m[2]));
    const bytes=readFileSync(m[2]);assert.equal(createHash("sha256").update(bytes).digest("hex"),m[1]);
    const dims=webpDimensions(bytes);assert.deepEqual(dims,{width:1600,height:1600});
  }
  assert.equal(names.size,10);
});
test("Batch50-A is enabled only through the validated build and cached offline",()=>{
  const b=readFileSync("scripts/build-salon.mjs","utf8");
  const s=readFileSync("scripts/finalize-service-worker.mjs","utf8");
  const v=readFileSync("src/components/salon/nail-visual.tsx","utf8");
  for(const src of [b,s,v])assert.match(src,/VITE_MANICURE_BATCH50_A/);
  assert.match(s,/files\.push\(file\)/);
  assert.match(v,/BATCH50_A_MANICURE_EDITORIAL_PHOTOS/);
});
test("Batch50-A published designs do not override prior nine manicure photos",()=>{
 const old=readFileSync("assets/hbeauty-nail-editorial-v4.sha256","utf8").trim().split(/\r?\n/);
 assert.equal(old.length,9);
 const hashes=new Set(old.map(x=>x.slice(0,64)));
 for(const line of lines)assert.ok(!hashes.has(line.slice(0,64)));
});
