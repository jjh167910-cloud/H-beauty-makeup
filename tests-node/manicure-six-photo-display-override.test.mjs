import test from "node:test";
import assert from "node:assert/strict";
import {existsSync, readFileSync} from "node:fs";
import {filterReviewedPhotos} from "../src/data/filter-reviewed-photos.js";
import {loadPhotoLocks} from "../scripts/verify-all-nail-photos.mjs";

const ids = [
  "nail-atlas-prism-champagne",
  "nail-atlas-prism-coral",
  "nail-atlas-velvet-midnight",
  "nail-atlas-modern-french-espresso",
  "nail-atlas-gradient-ruby",
  "nail-atlas-gradient-cobalt"
];

test("six owner-approved manicure photos keep original QA quarantine and exact locked sources", () => {
  const review=JSON.parse(readFileSync("src/data/nail-photo-review.json","utf8"));
  const grant=review.owner_temporary_display_override;
  assert.equal(grant.status,"OWNER_APPROVED_FOR_TEMPORARY_DISPLAY_ONLY_NOT_EDITORIAL_QA");
  assert.deepEqual([...grant.ids].sort(),[...ids].sort());
  const locks=loadPhotoLocks();
  const editorial=filterReviewedPhotos(
    Object.fromEntries(locks.map(item=>[item.id,item.path])),
    review.quarantined
  );
  for(const id of ids){
    const rejected=review.quarantined.find(item=>item.id===id);
    const lock=locks.find(item=>item.id===id);
    assert.ok(rejected?.reason?.length>20,"Preserve original review reason for "+id);
    assert.equal(lock?.hash,rejected.sha256,"Do not bypass the original source lock for "+id);
    assert.equal(lock?.kind,"manicure");
    assert.ok(existsSync(lock.path),"Owner display requires existing image "+id);
    assert.equal(editorial[id],undefined,"Temporary customer photo must not be editorial-approved: "+id);
  }
});

test("customer gallery shows six owner-authorized photos without bypassing strict editorial map",()=>{
  const source=readFileSync("src/components/salon/nail-visual.tsx","utf8");
  assert.ok(source.includes("photoReview.owner_temporary_display_override.ids"));
  assert.ok(source.includes("photoReview.quarantined.some"));
  assert.ok(source.includes("...OWNER_TEMPORARY_REVIEWED_MANICURE_PHOTOS"));
  assert.ok(source.includes("export const NAIL_CUSTOMER_PHOTOS"));
  assert.ok(source.includes("filterReviewedPhotos("));
});
