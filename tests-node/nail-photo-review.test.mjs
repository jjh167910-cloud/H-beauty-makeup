import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {filterReviewedPhotos} from "../src/data/filter-reviewed-photos.js";
import {loadPhotoLocks} from "../scripts/verify-all-nail-photos.mjs";

test("quarantine removes a photo from rendering and counts without changing its source map",()=>{
  const photos={"nail-wrong":"/wrong.webp","nail-good":"/good.webp","pedi-good":"/pedi.webp"};
  const result=filterReviewedPhotos(photos,[{id:"nail-wrong"},{id:"nail-not-enabled"}]);
  assert.deepEqual(result,{"nail-good":"/good.webp","pedi-good":"/pedi.webp"});
  assert.equal(Object.keys(photos).length,3);
});

test("review exclusions identify the exact locked sources and keep pedicure photos",()=>{
  const review=JSON.parse(readFileSync("src/data/nail-photo-review.json","utf8"));
  const locks=loadPhotoLocks();
  assert.equal(new Set(review.quarantined.map(x=>x.id)).size,review.quarantined.length);
  for(const item of review.quarantined){
    const lock=locks.find(x=>x.id===item.id);
    assert.equal(lock?.kind,"manicure");
    assert.equal(lock.hash,item.sha256,"A replaced source requires a fresh visual review");
    assert.ok(item.reason.length>20);
  }
  const active=filterReviewedPhotos(Object.fromEntries(locks.map(x=>[x.id,x.path])),review.quarantined);
  assert.equal(Object.keys(active).filter(id=>id.startsWith("pedi-")).length,78);
  assert.equal(Object.keys(active).length,locks.length-review.quarantined.length);
});
