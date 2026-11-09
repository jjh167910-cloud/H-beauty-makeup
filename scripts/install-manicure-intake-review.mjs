#!/usr/bin/env node
/**
 * Install all 146 user-provided original manicure WebPs in a SEPARATE review-only
 * public namespace. This does NOT approve images or enable customer catalog
 * photographs. Original 60 are independently SHA-locked by the existing ledger;
 * five new archives are locked at archive level and yield a per-image manifest.
 *
 * Source archives: user's original three 20-photo ZIP attachments, mirrored to
 * permanent Higgsfield media URLs on 2026-10-30 after explicit deploy request.
 *
 * Usage: node scripts/install-manicure-intake-review.mjs
 *        node scripts/install-manicure-intake-review.mjs --verify
 */
import { readFileSync, mkdirSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { webpDimensions } from "./audit-nail-photo-candidates.mjs";

export const SOURCES=Object.freeze([
  {batch:"01-of-08",url:"https://d2ol7oe51mr4n9.cloudfront.net/user_3JeOUdb9NaNBnQHWcT0xYSQ6MdR/93c0eb87-6591-4f88-833b-ae9fe0a17e6e.zip"},
  {batch:"04-of-08",url:"https://d2ol7oe51mr4n9.cloudfront.net/user_3JeOUdb9NaNBnQHWcT0xYSQ6MdR/38848cce-e621-4cc0-aea2-b95bab1c3e9b.zip"},
  {batch:"05-of-08",url:"https://d2ol7oe51mr4n9.cloudfront.net/user_3JeOUdb9NaNBnQHWcT0xYSQ6MdR/b7cbe4dd-249b-45ec-af32-6992542171d7.zip"}
]);
const LEDGER="docs/MANICURE_UPLOADED_60_ORIGINAL_SHA256_NOT_APPROVED_20261030.csv";
const OUT="public/review/photos";
const FULL_MANIFEST="public/review/manifest-146.json";
const NEW_ARCHIVE_LOCK="docs/HBEAUTY_NEW_86_SOURCE_ARCHIVE_LOCKS_20261030.json";
const QUEUE="docs/HBEAUTY_MANICURE_162_QUEUE.json";
const SHA=/^[a-f0-9]{64}$/;
const NAME=/^nail-[a-z0-9-]+\.webp$/;
const hash=x=>createHash("sha256").update(x).digest("hex");
const u16=(b,p)=>b.readUInt16LE(p),u32=(b,p)=>b.readUInt32LE(p);
const strict=(c,m)=>{if(!c)throw Error("Review-only asset import denied: "+m)};

export function records(root="."){
  const lines=readFileSync(resolve(root,LEDGER),"utf8").trimEnd().split(/\r?\n/);
  strict(lines.shift()==="catalog_id,sha256,visual_disposition,expected_shape,expected_length,expected_finish,native_generation_provenance,editorial_approval,release_permission","unknown intake ledger schema");
  const rows=lines.map((line,i)=>{
    const p=line.split(",");
    strict(p.length===9,"invalid ledger row "+i);
    const [id,sha,status,shape,length,finish,provenance,approval,permission]=p;
    strict(NAME.test(id+".webp")&&SHA.test(sha),"invalid original catalog ID or sha");
    strict(["VISUAL_CANDIDATE_NOT_APPROVED","HOLD_EXACT_STYLE_REVIEW","REJECT_REGENERATE"].includes(status),"unknown visual disposition "+id);
    strict(provenance==="UNVERIFIED"&&approval==="NOT_GRANTED"&&permission==="DENIED","image approval MUST remain denied "+id);
    return {id,sha,status,shape,length,finish};
  });
  strict(rows.length===60,"requires exactly 60 original files");
  strict(new Set(rows.map(x=>x.id)).size===60&&new Set(rows.map(x=>x.sha)).size===60,"duplicates in release-denied manifest");
  strict(rows.filter(x=>x.status==="VISUAL_CANDIDATE_NOT_APPROVED").length===28,"candidate count changed");
  strict(rows.filter(x=>x.status==="HOLD_EXACT_STYLE_REVIEW").length===16,"hold count changed");
  strict(rows.filter(x=>x.status==="REJECT_REGENERATE").length===16,"reject count changed");
  return rows;
}

/** Strict central-directory parser. File name and SHA are individually checked. */
export function extractZip(buf,{expectedCount=20}={}){
  strict(Buffer.isBuffer(buf)&&buf.length>22&&buf.length<20_000_000,"invalid source ZIP size");
  let end=-1;
  for(let p=buf.length-22;p>=Math.max(0,buf.length-65557);p--){
    if(u32(buf,p)===0x06054b50){end=p;break;}
  }
  strict(end>=0,"missing ZIP central directory");
  const count=u16(buf,end+10),size=u32(buf,end+12),start=u32(buf,end+16);
  strict(count===expectedCount&&start+size<=buf.length&&start>=0,"unexpected ZIP archive inventory");
  let pos=start;
  const out=new Map();
  for(let i=0;i<count;i++){
    strict(pos+46<=buf.length&&u32(buf,pos)===0x02014b50,"invalid central directory record");
    const method=u16(buf,pos+10),csize=u32(buf,pos+20),usize=u32(buf,pos+24);
    const nlen=u16(buf,pos+28),elen=u16(buf,pos+30),clen=u16(buf,pos+32),local=u32(buf,pos+42);
    strict(nlen>0&&nlen<150&&pos+46+nlen+elen+clen<=buf.length,"bad ZIP filename region");
    const name=buf.subarray(pos+46,pos+46+nlen).toString("utf8");
    pos+=46+nlen+elen+clen;
    strict(NAME.test(name)&&!out.has(name),"unexpected ZIP entry "+name);
    strict(method===8||method===0,"unsupported ZIP compression method");
    strict(csize<1_000_000&&usize>=25_000&&usize<1_000_000,"unsafe ZIP image length "+name);
    strict(local+30<=buf.length&&u32(buf,local)===0x04034b50,"missing ZIP local header");
    const offset=local+30+u16(buf,local+26)+u16(buf,local+28);
    strict(offset+csize<=buf.length,"truncated compressed image "+name);
    const compressed=buf.subarray(offset,offset+csize);
    const bytes=method===8?inflateRawSync(compressed,{maxOutputLength:1_000_000}):compressed;
    strict(bytes.length===usize,"ZIP uncompressed size mismatch "+name);
    out.set(name,bytes);
  }
  strict(pos===start+size&&out.size===expectedCount,"ZIP central directory mismatch");
  return out;
}

/**
 * Expected 86 pending exact IDs are inferred from the original 162-entry queue.
 * No source can be matched to a different user-facing design by filename rename.
 */
export function expectedNewRows(root="."){
  const old=records(root);
  const oldIds=new Set(old.map(x=>x.id));
  const queue=JSON.parse(readFileSync(resolve(root,QUEUE),"utf8")).batches.flatMap(x=>x.styles);
  strict(queue.length===162,"catalog queue changed unexpectedly");
  const pending=queue.filter(x=>x.qa_status==="NOT_GENERATED");
  strict(pending.length===146,"queue must contain 146 source-pending IDs");
  const missing=old.filter(x=>!pending.find(q=>q.id===x.id));
  strict(missing.length===0,"historical 60 ledger no longer matches pending queue");
  const remaining=pending.filter(x=>!oldIds.has(x.id));
  strict(remaining.length===86,"new archive intake must account for precisely 86 other style IDs");
  return remaining.map(x=>({
    id:x.id,shape:x.shape,length:x.length,finish:x.finish,
    status:"NEEDS_EDITORIAL_REVIEW",sha:null
  }));
}

export function lockedNewSources(root="."){
  const doc=JSON.parse(readFileSync(resolve(root,NEW_ARCHIVE_LOCK),"utf8"));
  strict(doc.schema===1&&doc.total_new===86&&doc.editorial_approval==="NOT_GRANTED","nonapproval archive lock schema invalid");
  strict(doc.sources?.length===5&&
    doc.sources.reduce((n,x)=>n+x.count,0)===86,"wrong archive count");
  strict(new Set(doc.sources.map(x=>x.batch)).size===5,"duplicate archive batch");
  const ids=["02-of-08","03-of-08","06-of-08","07-of-08","08-of-08"];
  for(let i=0;i<doc.sources.length;i++){
    const x=doc.sources[i];
    strict(x.batch===ids[i]&&x.count===(i===4?6:20),"archive expected count or order mismatch");
    strict(SHA.test(x.sha256),"missing source archive SHA-256");
    strict(x.url?.startsWith("https://d2ol7oe51mr4n9.cloudfront.net/"),"unexpected archive origin");
  }
  return doc.sources;
}

export async function install({root=".",verify=false,fetcher=fetch}={}){
  const old=records(root),added=expectedNewRows(root),byId=new Map([...old,...added].map(x=>[x.id,x]));
  strict(byId.size===146,"duplicate ID across original photo batches");
  // Keep the visible Persian/English names tied to the same authoritative
  // catalog entry as the immutable image ID and SHA-256. Never derive titles
  // from filenames or ask a reviewer to manually relabel a photo.
  const catalog=JSON.parse(readFileSync(resolve(root,QUEUE),"utf8")).batches.flatMap(x=>x.styles);
  const entries=catalog.filter(s=>s.qa_status==="NOT_GENERATED");
  const names=new Map(entries.map(s=>[s.id,{title:s.title,en:s.en}]));
  strict(entries.length===146&&names.size===146,"exact 146 catalog style titles are required");
  for(const [id,label] of names){
    strict(byId.has(id),"unknown source photo title: "+id);
    strict(typeof label.title==="string"&&label.title.trim().length>=3&&/[\u0600-\u06ff]/u.test(label.title),
      "missing Persian title for "+id);
    strict(typeof label.en==="string"&&label.en.trim().length>=3,
      "missing English fallback name for "+id);
  }
  const sources=[...SOURCES.map(x=>({...x,count:20,sha256:null})),...lockedNewSources(root)];
  const all=new Map(),generated=new Map();
  if(verify){
    const manifest=JSON.parse(readFileSync(resolve(root,FULL_MANIFEST),"utf8"));
    strict(manifest.schema===2&&manifest.count===146&&manifest.approval==="NOT_GRANTED"&&
      manifest.files?.length===146,"invalid local review manifest");
    for(const x of manifest.files){
      const row=byId.get(x.id),bytes=readFileSync(resolve(root,OUT,x.id+".webp"));
      strict(row&&(!row.sha||row.sha===x.sha),"local metadata does not match locked intake "+x.id);
      strict(x.title===names.get(x.id)?.title&&x.en===names.get(x.id)?.en,
        "review photo Persian/English name mismatch "+x.id);
      strict(hash(bytes)===x.sha,"review source bytes changed: "+x.id);
      const d=webpDimensions(bytes);
      strict(d.width===1600&&d.height===1600,"review source not native-sized: "+x.id);
      all.set(x.id+".webp",bytes);generated.set(x.id,x);
    }
  }else{
    for(const source of sources){
      let response;
      for(let attempt=1;attempt<=3;attempt++){
        try{
          response=await fetcher(source.url,{signal:AbortSignal.timeout(70_000)});
          strict(response.ok,"archive "+source.batch+" HTTP "+response.status);
          break;
        }catch(e){
          if(attempt===3)throw Error("Cannot retrieve original user archive "+source.batch+": "+String(e.message||e));
          await new Promise(ok=>setTimeout(ok,attempt*2000));
        }
      }
      const zipped=Buffer.from(await response.arrayBuffer());
      if(source.sha256)strict(hash(zipped)===source.sha256,
        "original archive SHA-256 mismatch for batch "+source.batch);
      const extracted=extractZip(zipped,{expectedCount:source.count});
      for(const [name,bytes] of extracted){
        const id=name.slice(0,-5),row=byId.get(id);
        strict(row&&!all.has(name),"duplicate/unrecognized uploaded ID "+name);
        const imageHash=hash(bytes);
        if(row.sha)strict(imageHash===row.sha,
          "original individual photo SHA-256 mismatch "+name);
        const d=webpDimensions(bytes);
        strict(d.width===1600&&d.height===1600,"wrong original dimensions "+name);
        all.set(name,bytes);
        generated.set(id,{id,sha:imageHash,status:row.status,shape:row.shape,length:row.length,finish:row.finish});
      }
    }
    strict(all.size===146&&generated.size===146,"must import all 146 originals atomically");
    strict(new Set([...generated.values()].map(x=>x.sha)).size===146,
      "byte-identical original photographs cannot enter review collection");
    const dir=resolve(root,OUT);
    mkdirSync(dir,{recursive:true});
    for(const [name,bytes] of all)writeFileSync(join(dir,name),bytes);
    const manifest={schema:2,count:146,approval:"NOT_GRANTED",
      scope:"PUBLIC REVIEW ONLY; NOT APPROVED FOR CUSTOMER GALLERY",
      native_generation_provenance:"UNVERIFIED",
      status_counts:{VISUAL_CANDIDATE_NOT_APPROVED:28,HOLD_EXACT_STYLE_REVIEW:16,REJECT_REGENERATE:16,NEEDS_EDITORIAL_REVIEW:86},
      files:[...generated.values()].map(row=>({
        ...row,title:names.get(row.id).title,en:names.get(row.id).en
      }))};
    writeFileSync(resolve(root,FULL_MANIFEST),JSON.stringify(manifest,null,2)+"\n");
  }
  const folder=resolve(root,OUT),found=readdirSync(folder).filter(x=>x.endsWith(".webp")).sort();
  strict(found.length===146&&found.every(x=>all.has(x)),"review directory includes missing/extra originals");
  const sum=[...all.values()].reduce((total,b)=>total+b.length,0);
  console.log("146 original images published in REVIEW ONLY namespace; approved=0",
    {files:all.size,bytes:sum,previouslyRejected:16,newPendingReview:86,customerGalleryChanges:0});
  return {files:all.size,bytes:sum};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  await install({verify:process.argv.includes("--verify")});
}