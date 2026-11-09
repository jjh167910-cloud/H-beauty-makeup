import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync,statSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {splitLargeAssets,LIMIT,PART} from "./split-large-assets.mjs";
import worker from "./worker.mjs";
test("Cloudflare chunked staging reconstructs original bytes without loss",async()=>{
 const root=mkdtempSync(join(tmpdir(),"hbeauty-chunk-test-"));
 try{
  const path=join(root,"tryon/face-hd/large.bin");
  mkdirSync(join(root,"tryon/face-hd"),{recursive:true});
  const original=Buffer.alloc(LIMIT+33_000);
  for(let i=0;i<original.length;i++)original[i]=(i*31+i>>>7)&255;
  writeFileSync(path,original);
  const expected=createHash("sha256").update(original).digest("hex");
  const m=splitLargeAssets(root);
  const entry=m.files["/tryon/face-hd/large.bin"];
  assert.ok(entry);
  assert.equal(entry.bytes,original.length);
  assert.equal(entry.sha256,expected);
  assert.ok(!existsSync(path));
  assert.ok(entry.parts.length>=2);
  for(const part of entry.parts){
   assert.ok(part.bytes<=PART);
   assert.equal(statSync(join(root,part.path.slice(1))).size,part.bytes);
  }
  const env={
   ASSETS:{
    async fetch(input){
     const url=new URL(typeof input==="string"?input:input.url);
     const local=join(root,url.pathname.slice(1));
     if(!existsSync(local))return new Response("Not found",{status:404});
     return new Response(readFileSync(local),{status:200});
    }
   }
  };
  const url="https://example.test/tryon/face-hd/large.bin";
  const head=await worker.fetch(new Request(url,{method:"HEAD"}),env);
  assert.equal(head.status,200);
  assert.equal(head.headers.get("content-length"),String(original.length));
  const response=await worker.fetch(new Request(url),env);
  assert.equal(response.status,200);
  const rebuilt=Buffer.from(await response.arrayBuffer());
  assert.equal(createHash("sha256").update(rebuilt).digest("hex"),expected);
  assert.equal(Buffer.compare(original,rebuilt),0);
 }finally{
  rmSync(root,{recursive:true,force:true});
 }
});
