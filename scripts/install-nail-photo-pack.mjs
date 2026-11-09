/**
 * Import one ZIP into the Vite public assets directory on the CI/build runner.
 * This avoids manually extracting 34 images in the GitHub interface.
 * No dependencies, archive paths restricted to the committed SHA256 allowlist.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { resolve, dirname } from "node:path";

export const NAIL_ARCHIVE = "assets/Hananeh_Nail_Studio_34_Look_Editorial_Pack_v2.zip";
export const NAIL_ARCHIVE_V3 = "assets/Hananeh_Nail_Studio_34_Look_Editorial_Pack_v3.zip";
export const NAIL_ARCHIVE_V4 = "assets/Hananeh_Nail_Studio_Quality_9_v4.zip";
const LOCK_V2 = "assets/hbeauty-nail-editorial-v2.sha256";
const LOCK_V3 = "assets/hbeauty-nail-editorial-v3.sha256";
const LOCK_V4 = "assets/hbeauty-nail-editorial-v4.sha256";
const SIGNATURE = 0x02014b50;

export function installNailPack(archivePath) {
  // Prefer the corrected v3 archive. The v2 archive remains supported so
  // existing checked-out builds do not unexpectedly break.
  const selected=archivePath ?? (existsSync(NAIL_ARCHIVE_V4) ? NAIL_ARCHIVE_V4 : existsSync(NAIL_ARCHIVE_V3) ? NAIL_ARCHIVE_V3 : NAIL_ARCHIVE);
  if (!existsSync(selected)) return {installed:false,count:0,edition:null};
  const edition=selected.endsWith("_v4.zip") ? 4 : selected.endsWith("_v3.zip") ? 3 : 2;
  const lockPath=edition===4 ? LOCK_V4 : edition===3 ? LOCK_V3 : LOCK_V2;
  const expectedCount=edition===4 ? 9 : 34;
  archivePath=selected;
  const bytes=readFileSync(archivePath);
  if(bytes.length<10_000 || bytes.length>8*1024*1024)
    throw new Error("Nail archive file size is unexpected");

  const lock=readFileSync(resolve(lockPath),'utf8').trim().split(/\r?\n/);
  const expected=new Map(lock.map(line=>{
    const parts=line.match(/^([a-f0-9]{64})\s+(public\/nails\/photos\/(?:nail|pedi)-[a-z0-9-]+\.webp)$/);
    if(!parts)throw new Error("Invalid nail ZIP allowlist");
    return [parts[2],parts[1]];
  }));
  if(expected.size!==expectedCount) throw new Error(`Expected ${expectedCount} nail image checksums`);
  if(edition>=3 && new Set(expected.values()).size!==expectedCount)
    throw new Error("Nail v3 photo lock contains duplicate images");

  // Find end of ZIP's central directory. We never extract arbitrary paths.
  let eocd=-1;
  for(let i=bytes.length-22; i>=Math.max(0,bytes.length-65557);i--)
    if(bytes.readUInt32LE(i)===0x06054b50){eocd=i;break;}
  if(eocd<0)throw new Error("ZIP central directory missing");
  const count=bytes.readUInt16LE(eocd+10);
  let at=bytes.readUInt32LE(eocd+16);
  if(count<expectedCount||count>50)throw new Error("Unexpected nail archive entry count");

  const decoded=new Map();
  for(let i=0;i<count;i++){
    if(at+46>eocd || bytes.readUInt32LE(at)!==SIGNATURE)
      throw new Error("Malformed ZIP directory");
    const flags=bytes.readUInt16LE(at+8);
    const method=bytes.readUInt16LE(at+10);
    const compressed=bytes.readUInt32LE(at+20);
    const plainSize=bytes.readUInt32LE(at+24);
    const nameLen=bytes.readUInt16LE(at+28);
    const extraLen=bytes.readUInt16LE(at+30);
    const commentLen=bytes.readUInt16LE(at+32);
    const localOffset=bytes.readUInt32LE(at+42);
    if(at+46+nameLen+extraLen+commentLen>eocd)throw new Error("Malformed ZIP entry length");
    const path=bytes.subarray(at+46,at+46+nameLen).toString('utf8');
    at+=46+nameLen+extraLen+commentLen;
    if(!expected.has(path))continue;
    if(decoded.has(path)||flags&1||!([0,8].includes(method))||plainSize<7_000||plainSize>500_000)
      throw new Error("Invalid ZIP nail photo entry "+path);
    if(localOffset+30>bytes.length||bytes.readUInt32LE(localOffset)!==0x04034b50)
      throw new Error("Invalid ZIP local header");
    const offset=localOffset+30+bytes.readUInt16LE(localOffset+26)+bytes.readUInt16LE(localOffset+28);
    if(offset+compressed>bytes.length)throw new Error("Truncated nail ZIP");
    const packed=bytes.subarray(offset,offset+compressed);
    const data=method===8?inflateRawSync(packed):packed;
    if(data.length!==plainSize||data.subarray(0,4).toString()!=="RIFF"||data.subarray(8,12).toString()!=="WEBP")
      throw new Error("Not a valid WebP in ZIP: "+path);
    if(createHash('sha256').update(data).digest('hex')!==expected.get(path))
      throw new Error("Nail image SHA256 mismatch "+path);
    decoded.set(path,data);
  }
  if(decoded.size!==expectedCount)throw new Error(`Nail archive incomplete: ${decoded.size}/${expectedCount} entries`);
  // Write only after validating every file. No partial publication.
  for(const [path,data] of decoded) {
    const target=resolve(path);
    mkdirSync(dirname(target),{recursive:true});
    writeFileSync(target,data);
  }
  console.log(`Installed verified nail photo ZIP v${edition}: ${expectedCount} unique paths`);
  return {installed:true,count:expectedCount,edition};
}
