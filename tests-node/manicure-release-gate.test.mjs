/** Protect the verified nine-photo manicure release from accidental reuse of
 * a placeholder/contact-sheet image under an approved ID. The other 211
 * styles remain vector inspirations until individually approved.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("approved manicure photo catalog is exactly the SHA-locked v4 nine", () => {
  const lockLines=readFileSync("assets/hbeauty-nail-editorial-v4.sha256","utf8").trim().split(/\r?\n/);
  const quality=JSON.parse(readFileSync("src/data/nail-photo-quality.json","utf8")).styles;
  const approved=Object.entries(quality)
    .filter(([,record])=>record.photo===true)
    .map(([id])=>id).sort();
  const named=lockLines.map(line=>{
    const match=line.match(/^([0-9a-f]{64})  public\/nails\/photos\/(nail-[a-z0-9-]+)\.webp$/);
    assert.ok(match,"Malformed SHA-256 manicure lock entry");
    return {hash:match[1],id:match[2]};
  });
  assert.equal(named.length,9,"Do not claim unreviewed photographs are approved");
  assert.equal(new Set(named.map(item=>item.hash)).size,9,"Duplicate approved image hashes");
  assert.equal(new Set(named.map(item=>item.id)).size,9,"Duplicate approved style IDs");
  assert.deepEqual(named.map(item=>item.id).sort(),approved,
    "Editorial approved-photo whitelist must match the locked asset release");
});

test("pedicure and manicure photo flags are independent",()=>{
  const visual=readFileSync("src/components/salon/nail-visual.tsx","utf8");
  assert.match(visual,/VITE_PEDICURE_78/);
  assert.match(visual,/VITE_NAIL_EDITORIAL_V2/);
  assert.match(visual,/NAIL_EDITORIAL_PHOTOS/);
  assert.match(visual,/\.\.\.MANICURE_EDITORIAL_PHOTOS/);
  assert.match(visual,/\.\.\.PEDICURE_EDITORIAL_PHOTOS/);
});
