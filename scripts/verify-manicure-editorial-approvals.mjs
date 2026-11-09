/**
 * The image checksum alone does not constitute photo-art approval.
 * This gate requires a separately committed, per-image review record for
 * every *new* dynamic manicure batch. Legacy releases are not retroactively
 * affected. Each reviewer must inspect the image at full native resolution.
 */
import {readFileSync,existsSync} from "node:fs";
import {resolve} from "node:path";

const SHA=/^[0-9a-f]{64}$/;
const ID=/^nail-[a-z0-9-]+$/;
const BATCH=/^hbeauty-manicure-batch[0-9]+[a-z]?(?:-[0-9]{8})?$/;
const APPROVAL="APPROVED_FOR_PUBLICATION";

export function verifyManicureEditorialApprovals(photos,{root="."}={}){
  if(!Array.isArray(photos))throw Error("Editorial QA requires photo records");
  if(photos.length===0)return {approved:0,batches:0};
  const queuePath=resolve(root,"docs/HBEAUTY_MANICURE_162_QUEUE.json");
  if(!existsSync(queuePath))throw Error("Editorial QA missing reconciled catalog queue");
  const queue=JSON.parse(readFileSync(queuePath,"utf8"));
  const expected=new Map(queue.batches.flatMap(batch=>batch.styles).map(x=>[x.id,x]));
  const groups=new Map(),seen=new Set();
  for(const photo of photos){
    if(!BATCH.test(photo.group)||!ID.test(photo.id)||!SHA.test(photo.hash))
      throw Error("Editorial QA unexpected image identifier or SHA");
    if(seen.has(photo.id))throw Error("Editorial QA duplicate ID "+photo.id);
    seen.add(photo.id);
    if(!expected.has(photo.id))throw Error("Editorial QA image outside remaining 162: "+photo.id);
    if(!groups.has(photo.group))groups.set(photo.group,[]);
    groups.get(photo.group).push(photo);
  }
  let approved=0;
  for(const [group,images] of groups){
    const path=resolve(root,"assets",group+".qa.json");
    if(!existsSync(path))throw Error("Editorial QA approval record missing for "+group);
    const data=JSON.parse(readFileSync(path,"utf8"));
    if(data.schema!==1||data.batch!==group||data.decision!==APPROVAL||
       !Array.isArray(data.images)||data.images.length!==images.length||
       typeof data.reviewer!=="string"||data.reviewer.trim().length<3||
       typeof data.reviewed_at!=="string"||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:/.test(data.reviewed_at)||
       !Number.isFinite(Date.parse(data.reviewed_at)))
      throw Error("Editorial QA batch approval incomplete for "+group);
    for(const image of images){
      const queued=expected.get(image.id);
      if(queued.qa_status!=="APPROVED"||queued.approved_by_qa!==true||queued.sha256!==image.hash)
        throw Error("Editorial QA queue has not authorized "+image.id);
    }
    const rows=new Map();
    for(const row of data.images){
      if(!row || !ID.test(row.id)||rows.has(row.id))
        throw Error("Editorial QA duplicate or malformed image approval in "+group);
      rows.set(row.id,row);
    }
    for(const image of images){
      const row=rows.get(image.id),spec=expected.get(image.id);
      if(!row||row.sha256!==image.hash||row.filename!==image.path)
        throw Error("Editorial QA identity mismatch "+image.id);
      if(row.anatomy_five_fingers!=="PASS"||row.nail_detail_and_cuticles!=="PASS"||
         row.pure_ivory_silk_no_stone!=="PASS"||
         row.exact_catalog_style!=="PASS"||row.no_duplicate_or_collage!=="PASS"||
         row.original_native_resolution!=="PASS"||
         row.reviewed_full_resolution!==true)
        throw Error("Editorial QA individual review incomplete "+image.id);
      for(const key of ["finish","shape","length","base","accent"]){
        if(row[key]!==spec[key])throw Error("Editorial QA catalog metadata mismatch "+image.id+" "+key);
      }
      if(typeof row.review_notes!=="string"||row.review_notes.trim().length<30)
        throw Error("Editorial QA lacks meaningful review notes "+image.id);
      approved++;
    }
  }
  return {approved,batches:groups.size};
}
