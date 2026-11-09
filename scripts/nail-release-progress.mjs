/** Derived release inventory: SHA-locked catalog files are authoritative, never a manual counter. */
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

export function summarizeNailRelease(locks,queue){
  if(!Array.isArray(locks)||!Array.isArray(queue?.batches))
    throw Error("Missing nail release manifests or manicure queue");
  const specs=queue.batches.flatMap(b=>b.styles||[]);
  const unique=new Set(specs.map(x=>x.id));
  if(unique.size!==specs.length||specs.length!==queue.missing_photo_count||
     queue.published_photo_count+specs.length!==queue.total_manicure_styles)
    throw Error("Original manicure cohort does not reconcile to catalog");
  const manicures=locks.filter(x=>x.kind==="manicure");
  const pedicures=locks.filter(x=>x.kind==="pedicure");
  if(pedicures.length!==queue.pedicure_photos_untouched)
    throw Error("Pedicure release count does not match locked baseline");
  const published=new Map(manicures.map(x=>[x.id,x]));
  if(published.size!==manicures.length)throw Error("Duplicate published manicure ID");
  let approved=0;
  for(const spec of specs){
    const lock=published.get(spec.id);
    if(spec.qa_status==="APPROVED"){
      if(spec.approved_by_qa!==true||typeof spec.sha256!=="string"||
         !lock||lock.hash!==spec.sha256||lock.path!==spec.file_path)
        throw Error("Approved manicure source is missing or mismatched: "+spec.id);
      approved++;
    }else{
      if(spec.approved_by_qa!==false||spec.sha256!==null||lock)
        throw Error("Unapproved manicure source has a published lock: "+spec.id);
    }
  }
  if(manicures.length!==queue.published_photo_count+approved)
    throw Error("Published manicure count does not reconcile with approved queue");
  const remaining=specs.length-approved;
  const result={
    manicurePublished:manicures.length,
    manicureTotal:queue.total_manicure_styles,
    manicureRemaining:remaining,
    pedicurePublished:pedicures.length,
    pedicureTotal:queue.pedicure_photos_untouched,
    originalQueueApproved:approved,
    originalQueueSize:specs.length,
    batches:queue.batches.map(b=>({
      batch:b.batch,
      approved:b.styles.filter(x=>x.qa_status==="APPROVED").length,
      total:b.styles.length
    }))
  };
  if(result.manicurePublished+remaining!==result.manicureTotal)
    throw Error("Invalid live-release progress arithmetic");
  return result;
}

export async function readNailReleaseProgress(root="."){
  const {loadPhotoLocks}=await import("./verify-all-nail-photos.mjs");
  const queue=JSON.parse(readFileSync(resolve(root,"docs/HBEAUTY_MANICURE_162_QUEUE.json"),"utf8"));
  const locks=loadPhotoLocks(root);
  const progress=summarizeNailRelease(locks,queue);
  const review=JSON.parse(readFileSync(resolve(root,"src/data/nail-photo-review.json"),"utf8"));
  for(const entry of review.quarantined){
    const lock=locks.find(x=>x.id===entry.id&&x.kind==="manicure");
    if(!lock||lock.hash!==entry.sha256)throw Error("Stale visual review: "+entry.id);
  }
  const quarantined=new Set(review.quarantined.map(x=>x.id)).size;
  return {...progress,manicureQuarantined:quarantined,
    manicureDisplayed:progress.manicurePublished-quarantined,
    manicureNeedingPhotos:progress.manicureRemaining+quarantined};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const progress=await readNailReleaseProgress();
  if(process.argv.includes("--markdown")){
    console.log("# H-Beauty locked manicure release inventory\n");
    console.log("- Manicure: "+progress.manicurePublished+"/"+progress.manicureTotal+"; remaining: "+progress.manicureRemaining);
    console.log("- Displayed manicure photos: "+progress.manicureDisplayed+"; quarantined: "+progress.manicureQuarantined+"; styles needing photos: "+progress.manicureNeedingPhotos);
    console.log("- Pedicure: "+progress.pedicurePublished+"/"+progress.pedicureTotal);
    for(const b of progress.batches)console.log("- "+b.batch+": "+b.approved+"/"+b.total+" approved within original queue");
    console.log("\nSource: SHA-locked Git repository manifests, NOT a live Cloudflare proof. Production requires successful live checks.");
  }else console.log(JSON.stringify(progress,null,2));
}
