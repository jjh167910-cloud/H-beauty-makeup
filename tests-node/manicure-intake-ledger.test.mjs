/**
 * Historical uploaded-photo intake ledger integrity.
 *
 * This test intentionally DOES NOT approve, publish, compare, decode, or attest
 * any source photo. It verifies that pending QC source IDs, metadata and hashes
 * remain unambiguous. Approved photos follow their separate release process.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const filename="docs/MANICURE_UPLOADED_60_ORIGINAL_SHA256_NOT_APPROVED_20261030.csv";
const columns=[
  "catalog_id","sha256","visual_disposition","expected_shape",
  "expected_length","expected_finish","native_generation_provenance",
  "editorial_approval","release_permission"
];
const statuses=new Set([
  "VISUAL_CANDIDATE_NOT_APPROVED",
  "HOLD_EXACT_STYLE_REVIEW",
  "REJECT_REGENERATE"
]);
const queue=JSON.parse(readFileSync(resolve(root,"docs/HBEAUTY_MANICURE_162_QUEUE.json"),"utf8"));
const catalog=new Map(queue.batches.flatMap(b=>b.styles).map(s=>[s.id,s]));

test("60-source historical intake remains exact-ID, SHA-unique and never self-approved",()=>{
  const csv=readFileSync(resolve(root,filename),"utf8").trimEnd().split(/\r?\n/);
  assert.deepEqual(csv.shift().split(","),columns);
  assert.equal(csv.length,60);
  const ids=new Set(),hashes=new Set(),counts=Object.fromEntries([...statuses].map(s=>[s,0]));
  for(const [index,line] of csv.entries()){
    const row=line.split(",");
    assert.equal(row.length,columns.length,"Unexpected CSV width on row "+(index+2));
    const [id,sha,status,shape,length,finish,provenance,approval,permission]=row;
    assert.match(id,/^nail-[a-z0-9-]+$/);
    assert.match(sha,/^[0-9a-f]{64}$/);
    assert.ok(statuses.has(status),"Invalid intake disposition "+id);
    assert.ok(!ids.has(id),"Duplicate catalog ID "+id);
    assert.ok(!hashes.has(sha),"Duplicate original image SHA "+id);
    ids.add(id);hashes.add(sha);counts[status]++;
    const spec=catalog.get(id);
    assert.ok(spec,"Unknown current catalog ID "+id);
    assert.equal(shape,spec.shape,"Shape does not match catalog "+id);
    assert.equal(length,spec.length,"Length does not match catalog "+id);
    assert.equal(finish,spec.finish,"Finish does not match catalog "+id);
    assert.equal(provenance,"UNVERIFIED");
    assert.equal(approval,"NOT_GRANTED");
    assert.equal(permission,"DENIED");
  }
  assert.deepEqual(counts,{
    VISUAL_CANDIDATE_NOT_APPROVED:28,
    HOLD_EXACT_STYLE_REVIEW:16,
    REJECT_REGENERATE:16
  });
});

test("16 visually rejected source byte hashes can never be republished unchanged",()=>{
  const lines=readFileSync(resolve(root,filename),"utf8").trimEnd().split(/\r?\n/).slice(1);
  const rejected=new Map(lines.map(line=>line.split(","))
    .filter(row=>row[2]==="REJECT_REGENERATE").map(row=>[row[1],row[0]]));
  assert.equal(rejected.size,16);
  const photos=resolve(root,"public/nails/photos");
  for(const entry of readdirSync(photos,{withFileTypes:true})){
    if(!entry.isFile()||!entry.name.endsWith(".webp"))continue;
    const bytes=readFileSync(resolve(photos,entry.name));
    const sha=createHash("sha256").update(bytes).digest("hex");
    assert.ok(!rejected.has(sha),
      "Previously rejected original has been published as "+entry.name+
      " (source catalog "+rejected.get(sha)+")");
  }
  const assets=resolve(root,"assets");
  for(const name of readdirSync(assets)){
    if(!name.endsWith(".sha256")||name.includes("rejected-"))continue;
    const path=resolve(assets,name);
    if(!statSync(path).isFile())continue;
    const text=readFileSync(path,"utf8");
    for(const [sha,id] of rejected){
      assert.ok(!text.includes(sha),
        "Previously rejected original "+id+" appears in release lock "+name);
    }
  }
});
