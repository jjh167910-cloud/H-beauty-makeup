import { readFileSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";

// Optional, exact-byte HB-001 release overlay. Must never alter other styles.
export function installHb001Overlay(root="dist") {
  const lock=resolve("assets/hb001-overlay.sha256");
  const source=resolve("release-overlays/hb001");
  if(!existsSync(lock)) {
    if(process.env.HB001_OVERLAY_REQUIRED==="true")throw Error("Required HB-001 release overlay lock missing");
    return false;
  }
  const entries=readFileSync(lock,"utf8").trim().split(/\r?\n/);
  const expected=new Map([["1.webp","looks/1.webp"],["1-thumb.webp","looks/sm/1.webp"]]);
  if(entries.length!==2) throw Error("HB-001 overlay requires exactly two SHA-256 entries");
  const verified=[];
  for(const line of entries){
    const match=/^([a-f0-9]{64})  (1(?:-thumb)?\.webp)$/.exec(line);
    if(!match||!expected.has(match[2])||verified.some(x=>x.name===match[2]))throw Error("Invalid HB-001 overlay lock");
    const path=resolve(source,match[2]);
    if(!existsSync(path))throw Error("Missing HB-001 overlay: "+match[2]);
    const bytes=readFileSync(path);
    if(bytes.toString("ascii",0,4)!=="RIFF"||bytes.toString("ascii",8,12)!=="WEBP"||createHash("sha256").update(bytes).digest("hex")!==match[1])throw Error("HB-001 checksum mismatch: "+match[2]);
    verified.push({name:match[2],target:resolve(root,expected.get(match[2]))});
  }
  for(const item of verified){mkdirSync(dirname(item.target),{recursive:true});copyFileSync(resolve(source,item.name),item.target)}
  return true;
}
