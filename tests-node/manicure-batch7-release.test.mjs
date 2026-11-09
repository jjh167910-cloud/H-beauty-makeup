import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {createHash} from "node:crypto";
import {webpDimensions} from "../scripts/audit-nail-photo-candidates.mjs";

const ids=["nail-micro-french","nail-black-french","nail-cherry-french","nail-pink-ombre","nail-peach-ombre","nail-atlas-geometry-ivory","nail-atlas-foil-ivory"];
const lock="assets/hbeauty-manicure-batch7.sha256";
test("all seven new manicure assets are unique native 1600px WebP files",()=>{
  const lines=readFileSync(lock,"utf8").trim().split(/\r?\n/);
  assert.equal(lines.length,7);
  const seenIds=new Set(),seenHashes=new Set();
  for(const line of lines){
    const match=line.match(/^([a-f0-9]{64})  (public\/nails\/photos\/nail-[a-z0-9-]+\.webp)$/);
    assert.ok(match,"invalid batch7 manifest line");
    const id=match[2].slice("public/nails/photos/".length,-5);
    assert.ok(ids.includes(id)&&!seenIds.has(id),"wrong or duplicate manicure ID");
    assert.ok(!seenHashes.has(match[1]),"duplicate photograph bytes");
    seenIds.add(id);seenHashes.add(match[1]);
    assert.ok(existsSync(match[2]),"missing "+match[2]);
    const bytes=readFileSync(match[2]);
    assert.equal(createHash("sha256").update(bytes).digest("hex"),match[1],"mismatch "+id);
    assert.deepEqual(webpDimensions(bytes),{width:1600,height:1600});
  }
  assert.equal(seenIds.size,7);
  const previousLocks=[
    "assets/hbeauty-nail-editorial-v4.sha256",
    "assets/hbeauty-manicure-midnight-glitter.sha256",
    "assets/hbeauty-manicure-four-20261029.sha256"
  ];
  for(const p of previousLocks){
    for(const line of readFileSync(p,"utf8").trim().split(/\r?\n/)){
      const [sha]=line.split(/\s+/);
      assert.ok(!seenHashes.has(sha),"previous approved photograph reused");
    }
  }
});
test("batch7 is conditionally enabled and precached without changing pedicure",()=>{
  const visual=readFileSync("src/components/salon/nail-visual.tsx","utf8");
  const build=readFileSync("scripts/build-salon.mjs","utf8");
  const sw=readFileSync("scripts/finalize-service-worker.mjs","utf8");
  for(const source of [visual,build,sw])assert.match(source,/VITE_MANICURE_BATCH7/);
  assert.match(visual,/\.\.\.BATCH7_MANICURE_EDITORIAL_PHOTOS/);
  assert.match(build,/Manicure batch7 photo content mismatch/);
  assert.match(sw,/files\.push\(file\)/);
  assert.match(visual,/VITE_PEDICURE_78/);
  assert.equal(readFileSync("assets/hbeauty-pedicure-78.sha256","utf8").trim().split(/\r?\n/).length,78);
});
