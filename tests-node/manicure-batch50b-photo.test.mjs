import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {createHash} from "node:crypto";
import {webpDimensions} from "../scripts/audit-nail-photo-candidates.mjs";

const targetIds=["nail-atlas-modern-french-espresso","nail-atlas-foil-cobalt","nail-atlas-modern-french-merlot","nail-atlas-modern-french-sage","nail-atlas-modern-french-lavender","nail-rose-french","nail-atlas-magnetic-midnight","nail-atlas-magnetic-coral","nail-atlas-magnetic-pearl"];
const lock="assets/hbeauty-manicure-batch50b.sha256";
test("manicure Batch50B publishes exactly nine full-res immutable photographs",()=>{
  assert.ok(existsSync(lock));
  const lines=readFileSync(lock,"utf8").trim().split(/\r?\n/);
  assert.equal(lines.length,9);
  const found=[], hashes=[];
  for(const line of lines){
    const m=line.match(/^([a-f0-9]{64})  (public\/nails\/photos\/(nail-[a-z0-9-]+)\.webp)$/);
    assert.ok(m,"Malformed manicure Batch50B release lock");
    const [_,hash,path,id]=m;
    assert.ok(existsSync(path),"Missing original "+id);
    const bytes=readFileSync(path);
    assert.equal(createHash("sha256").update(bytes).digest("hex"),hash);
    const {width,height}=webpDimensions(bytes);
    assert.equal(width,1600);
    assert.equal(height,1600);
    found.push(id);hashes.push(hash);
  }
  assert.deepEqual([...found].sort(),[...targetIds].sort());
  assert.equal(new Set(found).size,9);
  assert.equal(new Set(hashes).size,9);
  for(const older of ["assets/hbeauty-nail-editorial-v4.sha256","assets/hbeauty-manicure-batch7.sha256","assets/hbeauty-manicure-batch8.sha256","assets/hbeauty-manicure-batch50-a.sha256","assets/hbeauty-manicure-four-20261029.sha256","assets/hbeauty-manicure-midnight-glitter.sha256"]) {
    const previous=readFileSync(older,"utf8");
    for(const hash of hashes)assert.equal(previous.includes(hash),false,"Reused already-released photo hash");
  }
});
test("batch50B gallery and offline cache are release-gated without altering pedicures",()=>{
  const visual=readFileSync("src/components/salon/nail-visual.tsx","utf8");
  const build=readFileSync("scripts/build-salon.mjs","utf8");
  const sw=readFileSync("scripts/finalize-service-worker.mjs","utf8");
  assert.match(visual,/VITE_MANICURE_BATCH50_B/);
  assert.match(visual,/\.\.\.BATCH50_B_MANICURE_EDITORIAL_PHOTOS/);
  assert.match(visual,/\.\.\.PEDICURE_EDITORIAL_PHOTOS/);
  assert.match(build,/BATCH50B_IDS/);
  assert.match(sw,/VITE_MANICURE_BATCH50_B/);
  assert.match(sw,/files\.push\(file\)/);
  assert.match(build,/VITE_PEDICURE_78/);
});
