import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {createHash} from "node:crypto";
import {webpDimensions} from "../scripts/audit-nail-photo-candidates.mjs";

const ids=["nail-atlas-magnetic-espresso","nail-atlas-magnetic-sage","nail-atlas-geometry-blush","nail-atlas-prism-ivory","nail-atlas-gradient-pearl","nail-atlas-gradient-lavender","nail-atlas-gradient-ruby","nail-atlas-gradient-cobalt"];
const lock="assets/hbeauty-manicure-batch50c.sha256";

test("manicure Batch50C contains eight distinct, exact 1600px WebPs",()=>{
  const lines=readFileSync(lock,"utf8").trim().split(/\r?\n/);
  assert.equal(lines.length,8);
  const found=new Set(),hashes=new Set();
  for(const line of lines){
    const m=line.match(/^([a-f0-9]{64})  (public\/nails\/photos\/(nail-[a-z0-9-]+)\.webp)$/);
    assert.ok(m,"Bad Batch50C manifest entry");
    assert.ok(ids.includes(m[3]));
    assert.ok(!found.has(m[3])&&!hashes.has(m[1]),"Repeated style or image");
    found.add(m[3]);hashes.add(m[1]);
    assert.ok(existsSync(m[2]),"Missing original WebP");
    const bytes=readFileSync(m[2]);
    assert.equal(createHash("sha256").update(bytes).digest("hex"),m[1]);
    assert.deepEqual(webpDimensions(bytes),{width:1600,height:1600});
  }
  assert.deepEqual([...found].sort(),ids.slice().sort());
  for(const old of ["hbeauty-nail-editorial-v4.sha256","hbeauty-manicure-midnight-glitter.sha256","hbeauty-manicure-four-20261029.sha256","hbeauty-manicure-batch7.sha256","hbeauty-manicure-batch8.sha256","hbeauty-manicure-batch50-a.sha256","hbeauty-manicure-batch50b.sha256"]){
    const previous=readFileSync("assets/"+old,"utf8").trim().split(/\r?\n/);
    assert.ok(previous.every(x=>!hashes.has(x.split(/\s+/)[0])),"Previously released photo duplicated");
  }
});
test("Batch50C requires a locked all-or-nothing release and offline precache",()=>{
  const build=readFileSync("scripts/build-salon.mjs","utf8");
  const offline=readFileSync("scripts/finalize-service-worker.mjs","utf8");
  const visual=readFileSync("src/components/salon/nail-visual.tsx","utf8");
  for(const text of [build,offline,visual])assert.match(text,/VITE_MANICURE_BATCH50_C/);
  assert.match(build,/Incomplete Batch50C image release/);
  assert.match(offline,/Batch50C offline image checksum mismatch/);
  assert.match(visual,/BATCH50_C_MANICURE_EDITORIAL_PHOTOS/);
  assert.match(visual,/\.\.\.PEDICURE_EDITORIAL_PHOTOS/);
});
