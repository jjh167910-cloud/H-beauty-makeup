import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";

// Forge a container which passes basic RIFF dimensions and size checks but
// contains no valid VP8 compressed photograph. Chromium MUST reject it.
test("invalid image payload cannot pass as a high-resolution nail photograph",()=>{
  const dir=mkdtempSync(join(tmpdir(),"hbeauty-fake-photo-"));
  try{
    const size=26000,bytes=Buffer.alloc(size);
    bytes.write("RIFF",0);bytes.writeUInt32LE(size-8,4);
    bytes.write("WEBP",8);bytes.write("VP8 ",12);
    bytes.writeUInt32LE(size-20,16);
    bytes.set([0x9d,0x01,0x2a],23);
    bytes.writeUInt16LE(1024,26);bytes.writeUInt16LE(1024,28);
    writeFileSync(join(dir,"pedi-french.webp"),bytes);
    const result=spawnSync(process.execPath,["scripts/review-nail-photo-pixels.mjs",dir],
      {encoding:"utf8",env:process.env,timeout:60000});
    assert.equal(result.error,undefined,String(result.error));
    assert.notEqual(result.status,0,"Fake 1024px metadata must never be photo-approval evidence");
    assert.match(result.stderr,/Chromium could not decode pixels/);
  }finally{
    rmSync(dir,{recursive:true,force:true});
  }
});
