import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { NAIL_ARCHIVE_V4, installNailPack } from "../scripts/install-nail-photo-pack.mjs";

const quality=JSON.parse(readFileSync("src/data/nail-photo-quality.json","utf8"));
const lock=readFileSync("assets/hbeauty-nail-editorial-v4.sha256","utf8")
  .trim().split(/\r?\n/).map(line=>{
    const m=line.match(/^([a-f0-9]{64})\s+(public\/nails\/photos\/(nail|pedi)-[a-z0-9-]+\.webp)$/);
    assert.ok(m,"invalid checksum entry");
    return {sha:m[1],path:m[2],id:m[2].split("/").at(-1).slice(0,-5)};
  });

test("V4 photo quality policy preserves 34 styles and exposes only nine original-size references",()=>{
  assert.equal(Object.keys(quality.styles).length,34);
  const approved=Object.entries(quality.styles).filter(([,q])=>q.photo);
  assert.equal(approved.length,9);
  assert.equal(lock.length,9);
  assert.equal(new Set(lock.map(x=>x.sha)).size,9);
  assert.deepEqual(new Set(approved.map(([id])=>id)),new Set(lock.map(x=>x.id)));
  assert.ok(approved.every(([,q])=>q.native>=600));
  assert.equal(quality.styles["nail-midnight-glitter"].photo,false);
  assert.equal(quality.styles["nail-black-french"].photo,false);
  assert.equal(quality.styles["nail-marble"].native,1254);
  assert.ok(["pedi-classic-nude","pedi-french","pedi-ruby","pedi-blush","pedi-lavender","pedi-sparkle"]
    .every(id=>quality.styles[id].photo===false));
});

test("V4 installer validates the actual ZIP when supplied to build workspace",()=>{
  if(!existsSync(NAIL_ARCHIVE_V4))return;
  const installed=installNailPack();
  assert.deepEqual(installed,{installed:true,count:9,edition:4});
  for(const {path,sha} of lock){
    assert.ok(existsSync(path),"Missing "+path);
    const hash=createHash("sha256").update(readFileSync(path)).digest("hex");
    assert.equal(hash,sha,"Corrupt "+path);
  }
});

test("no photographic badge or misleading real-salon claim in the quality manifest",()=>{
  assert.match(quality.policy,/native.*600/i);
  assert.ok(!Object.entries(quality.styles).some(([id,q])=>q.photo&&q.native<600));
});
