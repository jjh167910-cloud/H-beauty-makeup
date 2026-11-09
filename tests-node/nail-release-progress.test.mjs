import test from "node:test";
import assert from "node:assert/strict";
import {summarizeNailRelease} from "../scripts/nail-release-progress.mjs";
const a="a".repeat(64),b="b".repeat(64);
function sample(){
  const path="public/nails/photos/nail-new.webp";
  return {
    queue:{published_photo_count:1,total_manicure_styles:3,missing_photo_count:2,pedicure_photos_untouched:2,batches:[{
      batch:"B61",styles:[
        {id:"nail-new",qa_status:"APPROVED",approved_by_qa:true,sha256:b,file_path:path},
        {id:"nail-pending",qa_status:"NOT_GENERATED",approved_by_qa:false,sha256:null,file_path:"public/nails/photos/nail-pending.webp"}
      ]
    }]},
    locks:[{id:"nail-old",kind:"manicure",hash:a,path:"public/nails/photos/nail-old.webp"},
      {id:"nail-new",kind:"manicure",hash:b,path},
      {id:"pedi-first",kind:"pedicure",hash:"c".repeat(64),path:"public/nails/photos/pedi-first.webp"},
      {id:"pedi-second",kind:"pedicure",hash:"d".repeat(64),path:"public/nails/photos/pedi-second.webp"}]
  };
}
test("derive published, pending, and batch counts",()=>{
  const {queue,locks}=sample(),s=summarizeNailRelease(locks,queue);
  assert.equal(s.manicurePublished,2);
  assert.equal(s.manicureRemaining,1);
  assert.equal(s.pedicurePublished,2);
  assert.deepEqual(s.batches,[{batch:"B61",approved:1,total:2}]);
});
test("fail when an unapproved photo appears in a lock",()=>{
  const {queue,locks}=sample();
  locks.push({id:"nail-pending",kind:"manicure",hash:"e".repeat(64),path:"public/nails/photos/nail-pending.webp"});
  assert.throws(()=>summarizeNailRelease(locks,queue),/Unapproved manicure/);
});
test("fail on a published photo checksum mismatch",()=>{
  const {queue,locks}=sample();locks[1].hash="e".repeat(64);
  assert.throws(()=>summarizeNailRelease(locks,queue),/Approved manicure source/);
});
test("fail on stale or incompatible catalog queue counts",()=>{
  const {queue,locks}=sample();queue.missing_photo_count=3;
  assert.throws(()=>summarizeNailRelease(locks,queue),/cohort does not reconcile/);
});

test("real repository SHA locks reconcile to the manicure queue", async()=>{
  const {readNailReleaseProgress}=await import("../scripts/nail-release-progress.mjs");
  const status=await readNailReleaseProgress();
  assert.equal(status.manicurePublished+status.manicureRemaining,status.manicureTotal);
  assert.equal(status.originalQueueApproved,status.manicurePublished-58);
  assert.equal(status.pedicurePublished,78);
  assert.equal(status.manicureDisplayed+status.manicureQuarantined,status.manicurePublished);
  assert.equal(status.manicureDisplayed+status.manicureNeedingPhotos,status.manicureTotal);
});
