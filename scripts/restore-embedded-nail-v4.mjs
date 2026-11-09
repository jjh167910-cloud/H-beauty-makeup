/**
 * Restore the exact, owner-approved V4 Nail Atelier WebP archive from GitHub
 * UTF-8 content fragments. The GitHub integration cannot commit binary
 * files directly, so the *lossless* base64 chunks are version-controlled.
 *
 * No remote fetch or account credentials; decoding is fully deterministic.
 * Any missing/corrupt fragment fails closed before Vite or Cloudflare deploy.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const EMBEDDED_ARCHIVE="assets/Hananeh_Nail_Studio_Quality_9_v4.zip";
export const EXPECTED_ARCHIVE_BYTES=395_762;
export const EXPECTED_ARCHIVE_SHA256="73618152697a6f8ff210179207e37ad321812ea233706b217ff7163ecda4ca89";
export const EMBEDDED_PART_COUNT=11;

export function reconstructNailArchive({write=true}={}) {
  const parts=Array.from({length:EMBEDDED_PART_COUNT},(_,i)=>
    resolve("assets/nail-v4-embedded/part-"+String(i).padStart(2,"0")+".b64.txt"));
  for (const part of parts) {
    if(!existsSync(part)) throw new Error("Missing checked-in salon image fragment: "+part);
  }
  const b64=parts.map(file=>readFileSync(file,"ascii").replace(/\s/g,"")).join("");
  if(b64.length!==Math.ceil(EXPECTED_ARCHIVE_BYTES/3)*4 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(b64))
    throw new Error("Corrupt Base64 salon image archive");
  const bytes=Buffer.from(b64,"base64");
  const digest=createHash("sha256").update(bytes).digest("hex");
  if(bytes.length!==EXPECTED_ARCHIVE_BYTES||digest!==EXPECTED_ARCHIVE_SHA256)
    throw new Error("Salon image archive integrity check failed");
  if(write){
    const destination=resolve(EMBEDDED_ARCHIVE);
    if(existsSync(destination)){
      const original=readFileSync(destination);
      if(original.length!==bytes.length ||
         createHash("sha256").update(original).digest("hex")!==digest)
        throw new Error("Existing nail image ZIP conflicts with embedded verified release");
    }else{
      mkdirSync(dirname(destination),{recursive:true});
      writeFileSync(destination,bytes);
    }
  }
  return {file:EMBEDDED_ARCHIVE,sha256:digest,bytes:bytes.length,parts:EMBEDDED_PART_COUNT};
}

if(process.argv[1] && resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)){
  console.log(JSON.stringify(reconstructNailArchive(),null,2));
}
