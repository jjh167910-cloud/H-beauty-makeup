/**
 * Install independently SHA-256-locked hairstyle photo mattes for 292 styles.
 * All originals remain in Git history. Downloads occur only on production
 * builds, before Vite packages the static assets / offline service worker.
 * A failure never silently publishes a half-replaced portrait catalog.
 *
 * No network operation is performed during application runtime.
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync, mkdirSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";

const configPath=resolve("assets/hbeauty-hair-ivory-292-v1.json");
const SIGNATURE_CENTRAL=0x02014b50;
const SIGNATURE_LOCAL=0x04034b50;
const SIGNATURE_END=0x06054b50;
const HEX=/^[a-f0-9]{64}$/;

export function getHairIvoryConfig(){
  const raw=JSON.parse(readFileSync(configPath,"utf8"));
  if(raw.version!==1 || raw.count!==292 || raw.assetCount!==584 ||
     raw.background!=="#F5F3EF" || raw.parts?.length!==6)
    throw Error("Invalid locked hairstyle matte manifest");
  for(let i=0;i<raw.parts.length;i++) {
    const p=raw.parts[i],first=i*50+1,last=Math.min((i+1)*50,292);
    if(p.first!==first||p.last!==last||!HEX.test(p.sha256))
      throw Error("Invalid hairstyle matte archive part "+i);
    const uri=new URL(p.url);
    if(uri.protocol!=="https:" || uri.hostname!=="d2ol7oe51mr4n9.cloudfront.net")
      throw Error("Untrusted hairstyle archive host");
  }
  return raw;
}

function archiveSHA(data){
  return createHash("sha256").update(data).digest("hex");
}

function decodePackedArchive(data,first,last){
  // Accept only ZIP_STORED archival WebP bytes. No ZIP traversal, globs,
  // duplicate entries, encrypted entries, arbitrary binary formats or extras.
  if(data.length<100_000||data.length>16*1024*1024)
    throw Error("Invalid hairstyle archive byte budget");
  let eocd=-1;
  for(let pos=data.length-22;pos>=Math.max(0,data.length-65_557);pos--){
    if(data.readUInt32LE(pos)===SIGNATURE_END){eocd=pos;break;}
  }
  if(eocd<0)throw Error("Hairstyle ZIP has no end-of-central-directory");
  const count=data.readUInt16LE(eocd+10),expectedCount=(last-first+1)*2;
  if(count!==expectedCount)throw Error("Wrong hairstyle ZIP image count");
  const centralOffset=data.readUInt32LE(eocd+16);
  const centralLength=data.readUInt32LE(eocd+12);
  if(centralOffset+centralLength>eocd)throw Error("Malformed hairstyle ZIP central dir");
  let at=centralOffset;
  const result=new Map();
  for(let n=0;n<count;n++){
    if(at+46>eocd||data.readUInt32LE(at)!==SIGNATURE_CENTRAL)
      throw Error("Malformed hairstyle ZIP entry");
    const flags=data.readUInt16LE(at+8);
    const method=data.readUInt16LE(at+10);
    const compressed=data.readUInt32LE(at+20);
    const size=data.readUInt32LE(at+24);
    const namelen=data.readUInt16LE(at+28);
    const extralen=data.readUInt16LE(at+30);
    const comments=data.readUInt16LE(at+32);
    const offset=data.readUInt32LE(at+42);
    const end=at+46+namelen+extralen+comments;
    if(end>eocd)throw Error("Truncated hairstyle ZIP central entry");
    const filename=data.toString("utf8",at+46,at+46+namelen);
    at=end;
    const match=filename.match(/^public\/looks\/(sm\/)?([1-9]\d{0,2})\.webp$/);
    const id=match?Number(match[2]):NaN;
    if(!match||id<first||id>last||result.has(filename)||flags&1||
       method!==0||size!==compressed||size<2000||size>1_800_000)
      throw Error("Unexpected hairstyle ZIP entry: "+filename);
    if(offset+30>data.length||data.readUInt32LE(offset)!==SIGNATURE_LOCAL)
      throw Error("Malformed hairstyle ZIP local entry");
    const dataStart=offset+30+data.readUInt16LE(offset+26)+data.readUInt16LE(offset+28);
    const bytes=data.subarray(dataStart,dataStart+compressed);
    if(bytes.length!==size||bytes.toString("ascii",0,4)!=="RIFF"||
       bytes.toString("ascii",8,12)!=="WEBP")
      throw Error("Invalid WebP photo in archive: "+filename);
    result.set(filename,bytes);
  }
  if(result.size!==expectedCount||at!==centralOffset+centralLength)
    throw Error("Incomplete hairstyle archive");
  for(let id=first;id<=last;id++){
    if(!result.has(`public/looks/${id}.webp`)||
       !result.has(`public/looks/sm/${id}.webp`))
      throw Error("Missing hairstyle pair "+id);
  }
  return result;
}

async function fetchLockedPart(p){
  const res=await fetch(p.url,{signal:AbortSignal.timeout(60_000)});
  if(!res.ok)throw Error("Hairstyle package unavailable: HTTP "+res.status);
  const length=Number(res.headers.get("content-length")||0);
  if(length>16*1024*1024)throw Error("Oversized hairstyle package response");
  const buffer=Buffer.from(await res.arrayBuffer());
  if(archiveSHA(buffer)!==p.sha256)
    throw Error("Hairstyle package checksum mismatch for "+p.first+"-"+p.last);
  return decodePackedArchive(buffer,p.first,p.last);
}

export async function installHairstyleIvory(){
  const config=getHairIvoryConfig();
  const packs=await Promise.all(config.parts.map(fetchLockedPart));
  // Entire 584-image dataset is validated before writing a single asset.
  const entries=new Map();
  for(const part of packs){
    for(const [path,bytes] of part) {
      if(entries.has(path))throw Error("Duplicate hairstyle asset");
      entries.set(path,bytes);
    }
  }
  if(entries.size!==config.assetCount)throw Error("Incomplete hairstyle matte pack");
  const staged=[];
  try {
    for(const [path,bytes] of entries) {
      const destination=resolve(path),temp=destination+".ivory-stage";
      mkdirSync(dirname(destination),{recursive:true});
      writeFileSync(temp,bytes);
      staged.push([temp,destination]);
    }
    for(const [temp,destination] of staged)renameSync(temp,destination);
  } finally {
    for(const [temp] of staged)if(existsSync(temp))unlinkSync(temp);
  }
  console.log("Installed 292 ivory portrait originals and 292 matching thumbnails (584 SHA-locked assets).");
  return {count:292,assets:entries.size,matte:config.background};
}
