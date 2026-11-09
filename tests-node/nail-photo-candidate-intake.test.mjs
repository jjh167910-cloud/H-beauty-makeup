import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { knownNailIds, webpDimensions, auditPhotoCandidates } from "../scripts/audit-nail-photo-candidates.mjs";

// This fixture is a structurally consistent RIFF/VP8 container, NOT an
// actual picture. Browser decoding and semantic/anatomy QA are separate gates.
function vp8Container(width=1024,height=1024,size=26000){
  assert.equal(size%2,0);
  const buf=Buffer.alloc(size,0);
  buf.write("RIFF",0,"ascii");buf.writeUInt32LE(size-8,4);
  buf.write("WEBP",8,"ascii");buf.write("VP8 ",12,"ascii");
  buf.writeUInt32LE(size-20,16);
  buf.set([0x9d,0x01,0x2a],23);
  buf.writeUInt16LE(width,26);buf.writeUInt16LE(height,28);
  return buf;
}
function temp(fn){
  const path=mkdtempSync(join(tmpdir(),"nail-preflight-"));
  try{return fn(path);}finally{rmSync(path,{recursive:true,force:true});}
}

test("candidate intake recognizes all 298 stable style IDs, including pedicure variants",()=>{
  const ids=knownNailIds();
  assert.equal(ids.size,298);
  for(const id of ["pedi-french","pedi-classic-nude","nail-midnight-glitter",
      "pedi-atlas-skinny-french-ivory","nail-atlas-prism-cobalt"])
    assert.ok(ids.has(id),id);
  assert.equal(ids.has("pedi-not-in-catalog"),false);
});

test("WebP RIFF preflight validates frame boundaries and dimensions",()=>{
  assert.deepEqual(webpDimensions(vp8Container(1024,900)),{width:1024,height:900});
  const truncated=vp8Container().subarray(0,25999);
  assert.throws(()=>webpDimensions(truncated),/RIFF header|file length/);
  const bad=vp8Container();bad.write("JPEG",8,"ascii");
  assert.throws(()=>webpDimensions(bad),/RIFF header/);
});

test("one original-size pedicure candidate reaches structural review only",()=>{
  temp(dir=>{
    writeFileSync(join(dir,"pedi-french.webp"),vp8Container(1024,1024));
    const result=auditPhotoCandidates(dir);
    assert.equal(result.status,"STRUCTURAL_PREFLIGHT_ONLY");
    assert.equal(result.count,1);
    assert.equal(result.approvedPhotoCountUnchanged,9);
    assert.equal(result.accepted[0].id,"pedi-french");
    assert.match(result.accepted[0].nextStep,/Chromium decode/);
  });
});

test("small contact-sheet crops, fake exports and unrelated IDs fail closed",()=>{
  temp(dir=>{
    writeFileSync(join(dir,"pedi-french.webp"),vp8Container(220,220));
    writeFileSync(join(dir,"pedi-blush.webp"),vp8Container(1000,350));
    writeFileSync(join(dir,"pedi-no-such-style.webp"),vp8Container());
    const report=auditPhotoCandidates(dir);
    assert.equal(report.status,"REJECTED");
    assert.equal(report.count,0);
    assert.equal(report.failures.length,3);
    assert.ok(report.failures.some(x=>x.includes("requires >=800px")));
    assert.ok(report.failures.some(x=>x.includes("unknown design ID")));
  });
});

test("different IDs using identical bytes cannot masquerade as new looks",()=>{
  temp(dir=>{
    const one=vp8Container();
    writeFileSync(join(dir,"pedi-french.webp"),one);
    writeFileSync(join(dir,"pedi-blush.webp"),one);
    const report=auditPhotoCandidates(dir);
    assert.equal(report.status,"REJECTED");
    assert.equal(report.count,1);
    assert.match(report.failures[0],/duplicate/);
  });
});

test("existing approved photos cannot be overwritten by a candidate batch",()=>{
  temp(dir=>{
    writeFileSync(join(dir,"nail-marble.webp"),vp8Container());
    const result=auditPhotoCandidates(dir);
    assert.equal(result.status,"REJECTED");
    assert.match(result.failures[0],/cannot be silently overwritten/);
  });
});

test("empty candidate batch does not falsely certify a new photo release",()=>{
  temp(dir=>{
    const result=auditPhotoCandidates(dir);
    assert.equal(result.status,"REJECTED");
    assert.equal(result.count,0);
    assert.match(result.failures[0],/No candidate photographs/);
  });
});
