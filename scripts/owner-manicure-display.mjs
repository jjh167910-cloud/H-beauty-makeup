/**
 * H-Beauty owner-selected manicure exhibition, separate from the strict
 * professionally reviewed editorial release gate. User explicitly authorized
 * temporary customer display of ALL 146 originals; earlier QC objections are
 * preserved and must never be rewritten as PASS.
 *
 * This module verifies immutable bytes and matches exact catalog titles/IDs
 * before the Vite build receives the list of owner-selected photo IDs.
 */
import {readFileSync,existsSync} from "node:fs";
import {resolve} from "node:path";
import {createHash} from "node:crypto";
import {webpDimensions} from "./audit-nail-photo-candidates.mjs";

const AUTH="docs/HBEAUTY_OWNER_TEMPORARY_146_DISPLAY_20261031.json";
const MANIFEST="public/review/manifest-146.json";
const QUEUE="docs/HBEAUTY_MANICURE_162_QUEUE.json";
const check=(condition,message)=>{if(!condition)throw Error("Owner-selected manicure display refused: "+message)};
const sha=b=>createHash("sha256").update(b).digest("hex");
const countsExpected={
  VISUAL_CANDIDATE_NOT_APPROVED:28,
  HOLD_EXACT_STYLE_REVIEW:16,
  REJECT_REGENERATE:16,
  NEEDS_EDITORIAL_REVIEW:86
};

export function ownerSelectedManicureIds({root="."}={}){
  const authPath=resolve(root,AUTH);
  if(!existsSync(authPath))return [];
  const approval=JSON.parse(readFileSync(authPath,"utf8"));
  check(approval.schema===1 && approval.status==="OWNER_AUTHORIZED_TEMPORARY_CUSTOMER_DISPLAY"
    && approval.mode==="temporary_override_visual_display_only"
    && approval.editorial_qc_status==="NOT_CERTIFIED"
    && approval.expected_count===146, "temporary owner display authorization is missing/invalid");
  const data=JSON.parse(readFileSync(resolve(root,MANIFEST),"utf8"));
  check(data.schema===2&&data.count===146&&data.approval==="NOT_GRANTED"
    &&data.files?.length===146,"immutable 146-photo review ledger missing");
  const fullQueue=JSON.parse(readFileSync(resolve(root,QUEUE),"utf8")).batches.flatMap(x=>x.styles);
  check(fullQueue.length===162,"original catalog queue changed unexpectedly");
  const pending=fullQueue.filter(x=>x.qa_status==="NOT_GENERATED");
  check(pending.length===146,"owner authorization no longer covers exactly the 146 unapproved images");
  const queue=new Map(pending.map(x=>[x.id,x]));
  check(queue.size===146,"catalog has duplicate IDs");
  const seen=new Set(),hashes=new Set(),counts={};
  for(const photo of data.files){
    check(/^nail-[a-z0-9-]+$/.test(photo.id)&&/^[0-9a-f]{64}$/.test(photo.sha),"invalid image ID/hash");
    check(!seen.has(photo.id)&&!hashes.has(photo.sha),"duplicate ID/photo hash "+photo.id);
    seen.add(photo.id);hashes.add(photo.sha);
    const catalog=queue.get(photo.id);
    check(catalog&&photo.title===catalog.title&&photo.en===catalog.en,
      "photo mismatch against Persian catalog "+photo.id);
    check(catalog.qa_status==="NOT_GENERATED"&&catalog.approved_by_qa===false,
      "owner display must not impersonate editorial QA for "+photo.id);
    counts[photo.status]=(counts[photo.status]||0)+1;
    const path=resolve(root,"public/review/photos",photo.id+".webp");
    check(existsSync(path),"source image missing "+photo.id);
    const bytes=readFileSync(path);
    const dim=webpDimensions(bytes);
    check(dim.width===1600&&dim.height===1600,"unexpected original dimensions "+photo.id);
    check(sha(bytes)===photo.sha,"source original SHA-256 mismatch "+photo.id);
  }
  check(seen.size===146&&Object.keys(counts).length===4
    &&Object.entries(countsExpected).every(([status,n])=>counts[status]===n),
    "temporary release cannot quietly erase historical QC statuses");
  for(const id of queue.keys())check(seen.has(id),"missing user-authorized photo "+id);
  return [...seen];
}
