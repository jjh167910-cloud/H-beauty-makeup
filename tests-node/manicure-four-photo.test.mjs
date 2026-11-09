import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {existsSync,readFileSync} from "node:fs";
import {webpDimensions} from "../scripts/audit-nail-photo-candidates.mjs";

const lock="assets/hbeauty-manicure-four-20261029.sha256";
const expectedIds=["nail-atlas-botanical-ruby","nail-atlas-botanical-espresso","nail-lavender-chrome","nail-silver-chrome"];
test("four manicure images are separate, 1600px, lossless-source locked and valid",()=>{
  assert.ok(existsSync(lock));
  const lines=readFileSync(lock,"utf8").trim().split(/\r?\n/);
  const ids=new Set(),hashes=new Set();
  assert.equal(lines.length,4);
  const old=readFileSync("assets/hbeauty-nail-editorial-v4.sha256","utf8");
  const midnight=readFileSync("assets/hbeauty-manicure-midnight-glitter.sha256","utf8");
  for(const line of lines){
    const m=line.match(/^([0-9a-f]{64})  (public\/nails\/photos\/(nail-[a-z0-9-]+)\.webp)$/);
    assert.ok(m);
    assert.ok(expectedIds.includes(m[3]));
    assert.ok(!ids.has(m[3])&&!hashes.has(m[1]));
    ids.add(m[3]);hashes.add(m[1]);
    assert.ok(!old.includes(m[1])&&!midnight.includes(m[1]));
    const bytes=readFileSync(m[2]);
    assert.equal(createHash("sha256").update(bytes).digest("hex"),m[1]);
    const d=webpDimensions(bytes);
    assert.deepEqual([d.width,d.height],[1600,1600]);
  }
  assert.deepEqual([...ids].sort(),[...expectedIds].sort());
  assert.equal(old.trim().split(/\r?\n/).length,9);
});
test("four-photo release participates in UI and SW only through validated build",()=>{
  const build=readFileSync("scripts/build-salon.mjs","utf8");
  const sw=readFileSync("scripts/finalize-service-worker.mjs","utf8");
  const view=readFileSync("src/components/salon/nail-visual.tsx","utf8");
  for(const source of [build,sw,view])assert.match(source,/VITE_MANICURE_FOUR/);
  assert.match(sw,/files\.push\(file\)/);
  assert.match(view,/\.\.\.FOUR_MANICURE_EDITORIAL_PHOTOS/);
});
