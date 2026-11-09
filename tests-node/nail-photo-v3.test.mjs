import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { NAIL_ARCHIVE_V3, installNailPack } from "../scripts/install-nail-photo-pack.mjs";

const lockPath="assets/hbeauty-nail-editorial-v3.sha256";

function readLock(){
  return readFileSync(lockPath,"utf8").trim().split(/\r?\n/).map(line=>{
    const match=line.match(/^([a-f0-9]{64})\s+(public\/nails\/photos\/(?:nail|pedi)-[a-z0-9-]+\.webp)$/);
    assert.ok(match,"Malformed photo lock entry");
    return {hash:match[1],path:match[2]};
  });
}

test("V3 photo collection specifies 34 distinct designs AND 34 distinct images",()=>{
  const entries=readLock();
  assert.equal(entries.length,34);
  assert.equal(new Set(entries.map(e=>e.path)).size,34,"duplicate filename");
  assert.equal(new Set(entries.map(e=>e.hash)).size,34,"duplicate image bytes");
  assert.equal(entries.filter(e=>e.path.includes("/pedi-")).length,6);
  assert.equal(entries.filter(e=>e.path.includes("/nail-")).length,28);
});

test("corrected full-frame marble and new midnight glitter are independently locked",()=>{
  const entries=readLock();
  const byName=new Map(entries.map(e=>[e.path,e.hash]));
  assert.notEqual(byName.get("public/nails/photos/nail-botanical.webp"),
    byName.get("public/nails/photos/nail-marble.webp"));
  assert.notEqual(byName.get("public/nails/photos/nail-cobalt-lines.webp"),
    byName.get("public/nails/photos/nail-midnight-glitter.webp"));
});

test("V3 ZIP activation validates every file if the asset is present",()=>{
  if(!existsSync(NAIL_ARCHIVE_V3)) return;
  const result=installNailPack(NAIL_ARCHIVE_V3);
  assert.deepEqual(result,{installed:true,count:34,edition:3});
  for(const {path,hash} of readLock()){
    const bytes=readFileSync(path);
    assert.equal(createHash("sha256").update(bytes).digest("hex"),hash,path);
  }
});
