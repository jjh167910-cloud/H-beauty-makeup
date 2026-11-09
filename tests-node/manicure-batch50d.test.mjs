import test from "node:test";
import assert from "node:assert/strict";
import {existsSync,readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {webpDimensions} from "../scripts/audit-nail-photo-candidates.mjs";
const expected=new Map([["nail-berry-ombre","b609a21ee50b6f02f714dfc33ed5e9185ba4844c09fcb28d68c834cccf36b002"],["nail-atlas-velvet-ivory","4bba14d502cb6e087dbc0b5e73e9ab375391d8eb521b9d29b160d8b5a9601e39"]]);
test("Batch50D is exactly two unique native 1600px WebPs",()=>{
  const lines=readFileSync("assets/hbeauty-manicure-batch50d.sha256","utf8").trim().split(/\r?\n/);
  assert.equal(lines.length,2);
  const actual=new Set();
  for(const line of lines){
    const m=line.match(/^([a-f0-9]{64})  public\/nails\/photos\/(nail-[a-z0-9-]+)\.webp$/);
    assert.ok(m,"Bad Batch50D manifest");
    assert.equal(m[1],expected.get(m[2]));actual.add(m[2]);
    const path="public/nails/photos/"+m[2]+".webp";
    assert.ok(existsSync(path));
    const bytes=readFileSync(path);
    assert.equal(createHash("sha256").update(bytes).digest("hex"),m[1]);
    assert.deepEqual(webpDimensions(bytes),{width:1600,height:1600});
  }
  assert.deepEqual([...actual].sort(),[...expected.keys()].sort());
  for(const lock of ["hbeauty-nail-editorial-v4","hbeauty-manicure-batch7","hbeauty-manicure-batch8","hbeauty-manicure-batch50-a","hbeauty-manicure-batch50b","hbeauty-manicure-batch50c"]){
    const old=readFileSync("assets/"+lock+".sha256","utf8");
    for(const digest of expected.values())assert.ok(!old.includes(digest),"No reused approved image hashes");
  }
});
test("Batch50D UI, build, offline cache and live verification are wired",()=>{
 const v=readFileSync("src/components/salon/nail-visual.tsx","utf8");
 const b=readFileSync("scripts/build-salon.mjs","utf8");
 const f=readFileSync("scripts/finalize-service-worker.mjs","utf8");
 const w=readFileSync(".github/workflows/deploy.yml","utf8");
 assert.match(v,/VITE_MANICURE_BATCH50_D/);
 assert.match(v,/BATCH50_D_MANICURE_EDITORIAL_PHOTOS/);
 assert.match(b,/Batch50D image checksum mismatch/);
 assert.match(f,/Batch50D offline photo checksum mismatch/);
 assert.match(w,/verify-live-manicure-batch50d\.mjs/);
});
