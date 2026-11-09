#!/usr/bin/env node
/**
 * Preflight newly generated SINGLE-image WebP candidates before manual review.
 * This is a staging audit, NOT photo approval and NOT an asset installer.
 * Chrom(e|ium) decode, optical sharpness, visual style/anatomy review and
 * release-lock updates remain separately required.
 *
 * Usage: node scripts/audit-nail-photo-candidates.mjs path/to/candidates
 * Each file: <existing-298-design-id>.webp
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const readText=(path)=>readFileSync(path,"utf8");
const hash=(b)=>createHash("sha256").update(b).digest("hex");

export function knownNailIds() {
  const original=JSON.parse(readText("src/data/nail-photo-quality.json")).styles;
  const atlas=readText("src/data/nail-expansion.ts");
  const section=(start,end)=>{
    const at=atlas.indexOf(start);
    if(at<0)throw Error("Missing nail catalog section "+start);
    const until=atlas.indexOf(end,at);
    if(until<0)throw Error("Unterminated nail catalog section "+start);
    return atlas.slice(at,until);
  };
  const identifiers=(s)=>[...s.matchAll(/\{id:"([a-z0-9-]+)"/g)].map(m=>m[1]);
  const colors=identifiers(section("const SHADES:","type Family"));
  const manicure=identifiers(section("const MANICURE_FAMILIES:","const PEDI_SHADES"));
  const pedi=identifiers(section("const PEDICURE_FAMILIES:","/** Stable family"));
  const pediShadeRefs=[...section("const PEDI_SHADES:","const PEDICURE_FAMILIES").matchAll(/SHADES\[(\d+)\]/g)].map(m=>colors[Number(m[1])]);
  const all=[
    ...Object.keys(original),
    ...manicure.flatMap(f=>colors.map(c=>"nail-atlas-"+f+"-"+c)),
    ...pedi.flatMap(f=>pediShadeRefs.map(c=>"pedi-atlas-"+f+"-"+c)),
  ];
  if(all.length!==298||new Set(all).size!==298)
    throw Error("Candidate audit requires exactly 298 unique stable nail IDs");
  return new Set(all);
}

/** Container-level WebP dimensions; pixel data is NOT decoded here. */
export function webpDimensions(buf) {
  if(buf.length<30||buf.toString("ascii",0,4)!=="RIFF"||
     buf.toString("ascii",8,12)!=="WEBP"||
     buf.readUInt32LE(4)+8!==buf.length)
    throw Error("Malformed WebP RIFF header or file length");
  let pos=12,dimensions=null,hasImagePayload=false;
  while(pos+8<=buf.length) {
    const type=buf.toString("ascii",pos,pos+4);
    const n=buf.readUInt32LE(pos+4),offset=pos+8;
    if(n>buf.length-offset)throw Error("Truncated WebP chunk");
    if(type==="VP8X" && n>=10){
      dimensions={width:1+buf.readUIntLE(offset+4,3),height:1+buf.readUIntLE(offset+7,3)};
    } else if(type==="VP8 " && n>=10){
      if(buf[offset+3]!==0x9d||buf[offset+4]!==0x01||buf[offset+5]!==0x2a)
        throw Error("Invalid VP8 image dimensions marker");
      const dims={width:buf.readUInt16LE(offset+6)&0x3fff,height:buf.readUInt16LE(offset+8)&0x3fff};
      if(dimensions && (dimensions.width!==dims.width||dimensions.height!==dims.height))
        throw Error("WebP extended-header dimensions disagree with image frame");
      dimensions=dims;
      hasImagePayload=true;
    } else if(type==="VP8L" && n>=5){
      if(buf[offset]!==0x2f)throw Error("Invalid VP8L signature");
      const dims={
        width:1+buf[offset+1]+((buf[offset+2]&0x3f)<<8),
        height:1+(buf[offset+2]>>6)+(buf[offset+3]<<2)+((buf[offset+4]&0x0f)<<10),
      };
      if(dimensions && (dimensions.width!==dims.width||dimensions.height!==dims.height))
        throw Error("WebP extended-header dimensions disagree with lossless frame");
      dimensions=dims;
      hasImagePayload=true;
    } else if(type==="ANIM"||type==="ANMF") {
      throw Error("Animated WebP is not appropriate for a static nail catalog");
    }
    pos=offset+n+(n%2);
  }
  if(pos!==buf.length||!dimensions||!hasImagePayload||dimensions.width<1||dimensions.height<1)
    throw Error("Incomplete WebP image container");
  return dimensions;
}

export function auditPhotoCandidates(directory,{knownIds=knownNailIds()}={}) {
  const dir=resolve(directory);
  if(!existsSync(dir))throw Error("Candidate directory does not exist: "+dir);
  const quality=JSON.parse(readText("src/data/nail-photo-quality.json")).styles;
  const approvedHashes=new Set(readText("assets/hbeauty-nail-editorial-v4.sha256")
    .trim().split(/\r?\n/).map(line=>line.split(/\s+/)[0]));
  const items=readdirSync(dir,{withFileTypes:true}).filter(e=>e.isFile());
  const failures=[],accepted=[],seenHashes=new Set();
  if(!items.length)failures.push("No candidate photographs found");
  if(items.length>40)failures.push("Review batches must contain at most forty photographs");
  for(const file of items){
    const name=file.name, id=name.replace(/\.webp$/i,"");
    if(!/^(nail|pedi)-[a-z0-9-]+\.webp$/.test(name)||!knownIds.has(id)){
      failures.push(name+": unknown design ID or unsupported filename");
      continue;
    }
    if(quality[id]?.photo){
      failures.push(name+": existing approved reference cannot be silently overwritten");
      continue;
    }
    const data=readFileSync(join(dir,name));
    if(data.length<25_000||data.length>2_000_000){
      failures.push(name+": size outside 25KB–2MB candidate bounds");
      continue;
    }
    let dimensions;
    try{dimensions=webpDimensions(data);}
    catch(error){failures.push(name+": "+error.message);continue;}
    const {width,height}=dimensions;
    if(Math.min(width,height)<800||Math.max(width,height)/Math.min(width,height)>1.5){
      failures.push(name+": requires >=800px on both axes and near-square framing");
      continue;
    }
    const digest=hash(data);
    if(approvedHashes.has(digest)||seenHashes.has(digest)){
      failures.push(name+": duplicate of approved or another staged image");
      continue;
    }
    seenHashes.add(digest);
    accepted.push({id,filename:basename(name),width,height,bytes:data.length,sha256:digest,
      nextStep:"Chromium decode, optical/fine-detail check, semantic design match and anatomy/rights review"});
  }
  return {status:failures.length?"REJECTED":"STRUCTURAL_PREFLIGHT_ONLY",
    count:accepted.length,approvedPhotoCountUnchanged:9,accepted,failures};
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const directory=process.argv[2];
  if(!directory){console.error("Usage: node scripts/audit-nail-photo-candidates.mjs <directory>");process.exit(2);}
  try{
    const report=auditPhotoCandidates(directory);
    console.log(JSON.stringify(report,null,2));
    if(report.failures.length)process.exitCode=1;
  }catch(e){console.error("Nail preflight error:",e.message);process.exitCode=1;}
}
