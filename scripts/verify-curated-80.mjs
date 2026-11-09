#!/usr/bin/env node
/** H-Beauty 80-image asset and metadata integrity gate. */
import {readFileSync,existsSync,readdirSync} from "node:fs";
import {createHash} from "node:crypto";
import {join,resolve} from "node:path";
const root=resolve(process.cwd()),data=join(root,"src/data"),assets=join(root,"public/makeup");
const issues=[],ids=new Set(),hashes=new Set();
const sha=b=>createHash("sha256").update(b).digest("hex");
function json(file){try{return JSON.parse(readFileSync(file,"utf8"))}catch(e){issues.push("Missing/invalid "+file+": "+e.message);return{}}}
const manifests=[
 {list:json(join(assets,"curated-40/manifest.json")),dir:"curated-40",start:1,prefix:"mk40-"},
 {list:json(join(assets,"curated-80/manifest.json")),dir:"curated-80",start:43,prefix:"mk80-"}
];
function idFor(m,i){return m.prefix+(m.start===1?String(i+1).padStart(2,"0"):String(i+43))}
for(const m of manifests){
 const looks=m.list.looks??[];
 if(m.list.lookCount!==40||looks.length!==40)issues.push("Expected forty "+m.dir+" manifest records");
 for(let i=0;i<looks.length;i++){
  const look=looks[i],id=idFor(m,i);
  if(look.id!==id||ids.has(id))issues.push("Duplicate/out-of-order ID "+id);
  ids.add(id);
  if(m.start===43){
   if(look.promptNumber!==i+43||!look.sourceFilename?.startsWith((i+43)+" - "))issues.push("Broken PNG mapping "+id);
   if(look.publishApproved!==false||look.identityApproved!==false||look.styleDistinctApproved!==false)issues.push("Missing unapproved baseline "+id);
  }
  for(const sub of ["","sm"]){
   const file=join(assets,m.dir,...(sub?[sub]:[]),id+".webp");
   if(!existsSync(file)){issues.push("Missing "+file);continue}
   const bytes=readFileSync(file),h=sha(bytes);
   if(bytes.length<(sub?4000:24000)||bytes.toString("ascii",0,4)!=="RIFF"||bytes.toString("ascii",8,12)!=="WEBP")issues.push("Invalid WebP "+file);
   if(sub){
    if(look.thumbSha256&&h!==look.thumbSha256)issues.push("Thumbnail checksum mismatch "+id);
   }else{
    if(h!==look.sha256)issues.push("Master checksum mismatch "+id);
    if(hashes.has(h))issues.push("Byte-identical master image "+id);
    hashes.add(h);
   }
  }
 }
 for(const sub of ["","sm"]){
  const dir=join(assets,m.dir,sub);
  if(existsSync(dir)&&readdirSync(dir).filter(x=>x.endsWith(".webp")).length!==40)issues.push("Exactly 40 "+m.dir+" "+sub+" images required");
 }
}
function records(file){return readFileSync(join(data,file),"utf8").split("\n")
  .filter(line=>/^\s*\{"id":"(?:mk40|mk80)-/.test(line)).map(line=>JSON.parse(line.trim().replace(/,$/,"")))}
try{
 const original=records("makeup-curated-40.ts"),additional=records("makeup-curated-43-82.ts");
 if(original.length!==40||additional.length!==40)issues.push("Expected 40+40 static TS records");
 const all=[...original,...additional],expected=manifests[1].list.looks??[];
 for(const field of ["id","name","promptNumber"])if(new Set(all.map(x=>x[field])).size!==80)issues.push("Repeated "+field+" in 80-look catalog");
 for(let i=0;i<additional.length;i++){
  const a=additional[i],b=expected[i];if(!b)continue;
  if(a.id!==b.id||a.promptNumber!==b.promptNumber||a.image!==b.image||a.thumb!==b.thumb)issues.push("Metadata/asset mismatch "+a.id);
  if(b.sourceFilename.slice(5,-4)!==a.nameEn)issues.push("ZIP name mismatch "+a.id);
  if(!a.name||!a.finish||!a.description||!a.serviceId)issues.push("Incomplete title or brief "+a.id);
 }
}catch(e){issues.push("Source catalog unreadable: "+e.message)}
if(process.argv.includes("--release")){
 const path=process.env.HBEAUTY_MAKEUP_APPROVALS_PATH??join(root,".makeup-curated-80-approvals.local.json");
 if(!existsSync(path))issues.push("Private model/identity/style/publication approvals missing");
 else{
  const verified=json(path).looks??{};
  for(const m of manifests)for(const look of m.list.looks??[]){
   const a=verified[look.id];
   if(a?.sha256!==look.sha256||a?.identityApproved!==true||a?.styleDistinctApproved!==true||
      a?.publishApproved!==true||a?.modelPublicationConsent!==true)issues.push("Unapproved publication "+look.id);
  }
 }
}
console.log("80-look verification: "+ids.size+" IDs, "+hashes.size+" distinct full images, "+issues.length+" errors");
issues.forEach(e=>console.error("ERROR "+e));if(issues.length)process.exit(1);
