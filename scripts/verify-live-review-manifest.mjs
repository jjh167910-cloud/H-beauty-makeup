#!/usr/bin/env node
/**
 * After the Cloudflare Worker has been deployed, ensure that its HTML and JSON
 * review metadata are byte-identical to the build being released. Image checks
 * are performed separately in verify-all-nail-photos.mjs.
 * This blocks false "deployed" claims when a live metadata asset is stale.
 */
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const check=(condition,msg)=>{if(!condition)throw Error(msg)};
const files=[
  "review/manifest-146.json",
  "review/manicure-146-preliminary-suggestions.json",
  "review/manicure-intake.html",
  "review/editorial-workspace.html",
];
const local=new Map(files.map(name=>[name,readFileSync(resolve("dist",name))]));
const manifest=JSON.parse(local.get(files[0]).toString("utf8"));
const suggestions=JSON.parse(local.get(files[1]).toString("utf8"));
check(manifest.schema===2&&manifest.count===146&&manifest.approval==="NOT_GRANTED"
  &&manifest.files?.length===146,"Local build must have exactly 146 unapproved photos");
check(suggestions.schema===1&&suggestions.images?.length===146,
  "Local build missing matching 146 editorial suggestions");
const catalog=new Map(suggestions.images.map(item=>[item.id,item.catalog?.title]));
check(catalog.size===146,"Catalog titles not uniquely indexed");
for(const row of manifest.files){
  check(row.title===catalog.get(row.id)&&/[\u0600-\u06ff]/u.test(row.title)&&
    /^[a-f0-9]{64}$/.test(row.sha), "Review photo title/source mismatch: "+row.id);
}
const base=(process.env.HBEAUTY_PUBLIC_URL||
 "https://h-beauty.mostifa2273.workers.dev").replace(/\/$/,"");
const revision=process.env.GITHUB_SHA||"review-persian-cachefix";
let lastError;
for(let attempt=1;attempt<=9;attempt++){
 try{
  for(const [name,expected] of local){
   const response=await fetch(
     base+"/"+name+"?live-review-sha="+encodeURIComponent(revision+"-"+attempt),{
       cache:"no-store",headers:{"Cache-Control":"no-cache"},
       signal:AbortSignal.timeout(30000)
     });
   check(response.ok, "Live review file HTTP "+response.status+": "+name);
   const live=Buffer.from(await response.arrayBuffer());
   check(sha(live)===sha(expected),
     "Live review asset differs from current build: "+name);
  }
  console.log("Verified 146 Persian photo names and 4 live review metadata/page SHA-256 matches");
  lastError=null;break;
 }catch(error){
  lastError=error;
  if(attempt<9)await new Promise(done=>setTimeout(done,8000));
 }
}
if(lastError)throw lastError;
