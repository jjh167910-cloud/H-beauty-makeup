import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,rmSync,readFileSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {LOCKS,releaseLocks} from "../scripts/verify-all-nail-photos.mjs";

test("new signed manicure batches auto-register and respect the 50-image limit",()=>{
  const root=mkdtempSync(join(tmpdir(),"hbeauty-future-"));
  try {
    mkdirSync(join(root,"assets"));
    const path=join(root,"assets","hbeauty-manicure-batch60.sha256");
    writeFileSync(path,"a".repeat(64)+"  public/nails/photos/nail-sage-garden.webp\n");
    const groups=releaseLocks(root);
    assert.equal(groups.length,LOCKS.length+1);
    assert.equal(groups.at(-1).name,"hbeauty-manicure-batch60");
    assert.equal(groups.at(-1).count,1);
    writeFileSync(path,Array.from({length:51},(_,i)=>"a".repeat(64)+"  public/nails/photos/nail-style-"+i+".webp").join("\n"));
    assert.throws(()=>releaseLocks(root),/1 to 50/);
    rmSync(path);
    writeFileSync(join(root,"assets","hbeauty-rejected-47-stone-sources.sha256"),"a".repeat(64)+"  rejected.png");
    assert.equal(releaseLocks(root).length,LOCKS.length,"Rejection lists can never authorize releases");
  }finally {rmSync(root,{recursive:true,force:true});}
});

test("dynamic batch is gated at build, offline precache, and gallery wiring",()=>{
  const build=readFileSync("scripts/build-salon.mjs","utf8");
  const offline=readFileSync("scripts/finalize-service-worker.mjs","utf8");
  const gallery=readFileSync("src/components/salon/nail-visual.tsx","utf8");
  assert.match(build,/dynamicApproved=loadPhotoLocks/);
  assert.match(build,/d\.width<1200\|\|d\.height<1200/);
  assert.match(build,/VITE_MANICURE_DYNAMIC_IDS:dynamicApproved/);
  assert.match(offline,/dynamicLocked=loadPhotoLocks/);
  assert.match(offline,/Dynamic manicure offline list differs/);
  assert.match(gallery,/FUTURE_MANICURE_EDITORIAL_PHOTOS/);
  assert.match(gallery,/VITE_MANICURE_DYNAMIC_IDS/);
});
