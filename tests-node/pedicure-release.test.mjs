import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {installPedicure78} from "../scripts/install-pedicure-78-pack.mjs";
const repo=resolve(import.meta.dirname,"..");
function fixture(run){
  const root=mkdtempSync(join(tmpdir(),"hbeauty-pedi-"));
  try{
    mkdirSync(join(root,"assets","pedicure-parts"),{recursive:true});
    copyFileSync(join(repo,"assets/hbeauty-pedicure-78.sha256"),join(root,"assets/hbeauty-pedicure-78.sha256"));
    return run(root);
  }finally{rmSync(root,{force:true,recursive:true});}
}
test("78-photo pack absent: preserve SVG fallback",()=>fixture(root=>{
  assert.deepEqual(installPedicure78({root}),{installed:false,count:0});
}));
test("partial ZIP upload fails without changing public assets",()=>fixture(root=>{
  writeFileSync(join(root,"assets/pedicure-parts/HB78_P1.zip"),"partial");
  assert.throws(()=>installPedicure78({root}),/Partial pedicure ZIP upload: 1\/6/);
}));
test("partial manually staged photos fail closed",()=>fixture(root=>{
  const dir=join(root,"public/nails/photos");mkdirSync(dir,{recursive:true});
  writeFileSync(join(dir,"pedi-classic-nude.webp"),"not a valid WebP");
  assert.throws(()=>installPedicure78({root}),/Partial pedicure image upload: 1\/78/);
}));
test("tampered release lock is rejected",()=>fixture(root=>{
  writeFileSync(join(root,"assets/hbeauty-pedicure-78.sha256"),"bad entry");
  assert.throws(()=>installPedicure78({root}),/Invalid pedicure SHA256 release lock/);
}));
