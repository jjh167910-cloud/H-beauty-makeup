
import { readFileSync,existsSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import {webpDimensions,knownNailIds} from "../scripts/audit-nail-photo-candidates.mjs";

const approved=["nail-atlas-geometry-champagne","nail-atlas-botanical-pearl","nail-gold-french","nail-champagne","nail-rose-glitter","nail-modern-lines","nail-atlas-velvet-ruby","nail-atlas-velvet-champagne"];
const lockPath="assets/hbeauty-manicure-batch8.sha256";
const previousLocks=[
"assets/hbeauty-nail-editorial-v4.sha256",
"assets/hbeauty-manicure-midnight-glitter.sha256",
"assets/hbeauty-manicure-four-20261029.sha256",
"assets/hbeauty-manicure-batch7.sha256"
];
test("batch8 has exactly eight full-resolution distinct, SHA-locked manicure photographs",()=>{
 const entries=readFileSync(lockPath,"utf8").trim().split(/\r?\n/);
 assert.equal(entries.length,8);
 const seenIDs=new Set(),seenHashes=new Set(),known=knownNailIds();
 const oldHashes=new Set(previousLocks.flatMap(path=>readFileSync(path,"utf8").trim().split(/\r?\n/).map(line=>line.split(/\s+/)[0])));
 for(const line of entries){
  const match=line.match(/^([0-9a-f]{64})  (public\/nails\/photos\/(nail-[a-z0-9-]+)\.webp)$/);
  assert.ok(match,"Invalid batch8 source path/hash");
  const [,hash,path,id]=match;
  assert.ok(approved.includes(id)&&known.has(id),"Unrecognized manicure style ID "+id);
  assert.ok(!seenIDs.has(id)&&!seenHashes.has(hash),"Duplicate style/image");
  assert.ok(!oldHashes.has(hash),"Batch8 image duplicates previously approved photo");
  seenIDs.add(id);seenHashes.add(hash);
  assert.ok(existsSync(path),"Missing source photo "+path);
  const bytes=readFileSync(path);
  assert.ok(bytes.length>=25_000&&bytes.length<=2_200_000);
  assert.equal(createHash("sha256").update(bytes).digest("hex"),hash);
  assert.deepEqual(webpDimensions(bytes),{width:1600,height:1600});
 }
 assert.deepEqual([...seenIDs].sort(),[...approved].sort());
});
test("batch8 is build-gated and independently cached offline",()=>{
 const build=readFileSync("scripts/build-salon.mjs","utf8");
 const sw=readFileSync("scripts/finalize-service-worker.mjs","utf8");
 const gallery=readFileSync("src/components/salon/nail-visual.tsx","utf8");
 for(const s of [build,sw,gallery])assert.match(s,/VITE_MANICURE_BATCH8/);
 assert.match(build,/Manicure batch8 photograph checksum mismatch/);
 assert.match(sw,/files\.push\(file\)/);
 assert.match(gallery,/BATCH8_MANICURE_EDITORIAL_PHOTOS/);
 assert.match(gallery,/\.\.\.PEDICURE_EDITORIAL_PHOTOS/);
});
