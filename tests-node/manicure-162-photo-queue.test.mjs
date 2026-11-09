import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {knownNailIds} from "../scripts/audit-nail-photo-candidates.mjs";
import {loadPhotoLocks,LOCKS} from "../scripts/verify-all-nail-photos.mjs";

test("remaining manicure editorial queue has all 162 unique catalog references in 50-photo groups",()=>{
 const plan=JSON.parse(readFileSync("docs/HBEAUTY_MANICURE_162_QUEUE.json","utf8"));
 const known=knownNailIds();
 assert.equal(plan.total_manicure_styles,220);
 assert.equal(plan.published_photo_count,58);
 assert.equal(plan.missing_photo_count,162);
 assert.equal(plan.pedicure_photos_untouched,78);
 assert.deepEqual(plan.batch_sizes,[50,50,50,12]);
 const items=plan.batches.flatMap(batch=>{
   assert.ok(typeof batch.status==="string");
   assert.ok(batch.styles.length>=1&&batch.styles.length<=50);
   assert.match(batch.target_manifest,/^assets\/hbeauty-manicure-batch6[1-4]\.sha256$/);
   return batch.styles;
 });
 assert.equal(items.length,162);
 assert.equal(new Set(items.map(x=>x.id)).size,162);
 for(const item of items){
   assert.ok(known.has(item.id),"Unknown catalog style "+item.id);
   assert.ok(item.file_path.endsWith("/"+item.id+".webp"));
   if(item.qa_status==="NOT_GENERATED"){
     assert.equal(item.sha256,null);
     assert.equal(item.approved_by_qa,false);
   }else{
     assert.equal(item.qa_status,"APPROVED");
     assert.match(item.sha256,/^[0-9a-f]{64}$/);
     assert.equal(item.approved_by_qa,true);
   }
 }
 const staged=loadPhotoLocks().filter(photo=>!LOCKS.some(group=>group.name===photo.group));
 const approved=items.filter(item=>item.qa_status==="APPROVED");
 assert.equal(approved.length,staged.length,"QA queue must cover every dynamically released photo");
 for(const photo of staged){
   const row=approved.find(x=>x.id===photo.id);
   assert.ok(row&&row.sha256===photo.hash,"QA release identity differs from manifest "+photo.id);
 }
});
