import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {join} from "node:path";

/**
 * Reject only byte-exact matches to 47 sources that were visibly placed on
 * stone/limestone. This does not perform subjective style or anatomy approval.
 */
test("all 47 excluded stone-background source hashes are absent from published nail releases",()=>{
  const rejectLines=readFileSync("assets/hbeauty-rejected-47-stone-sources.sha256","utf8").trim().split(/\r?\n/);
  assert.equal(rejectLines.length,47);
  const rejected=new Set();
  for(const line of rejectLines){
    const m=line.match(/^([0-9a-f]{64})  ([^\r\n]+\.png)$/);
    assert.ok(m,"Bad rejection record: "+line);
    assert.ok(!rejected.has(m[1]),"Repeated image digest in rejected list");
    rejected.add(m[1]);
  }
  const locks=readdirSync("assets").filter(name=>
    /^hbeauty-manicure-.*\.sha256$/.test(name) ||
    name==="hbeauty-nail-editorial-v4.sha256" ||
    name==="hbeauty-pedicure-78.sha256");
  assert.ok(locks.length>=10,"Expected all current release lockfiles");
  for(const filename of locks){
    const lines=readFileSync(join("assets",filename),"utf8").trim().split(/\r?\n/);
    for(const line of lines){
      const match=line.match(/^([0-9a-f]{64})  public\/nails\/photos\/(?:nail|pedi)-[a-z0-9-]+\.webp$/);
      assert.ok(match,"Malformed release lock "+filename);
      assert.ok(!rejected.has(match[1]),"Stone-background source illegally entered release "+filename);
    }
  }
});
test("50-source QA audit holds all unapproved assets rather than treating names as signoff",()=>{
  const lines=readFileSync("docs/HBEAUTY_MANICURE_50_SOURCE_QA_20261029.csv","utf8").trim().split(/\r?\n/);
  assert.equal(lines.length,51);
  assert.equal(lines.filter(line=>line.includes("REJECT_STONE_BACKGROUND")).length,47);
  assert.equal(lines.filter(line=>line.includes("HOLD_MARBLE_THEME")).length,3);
  assert.equal(lines.filter(line=>line.endsWith(",NO")).length,50);
});