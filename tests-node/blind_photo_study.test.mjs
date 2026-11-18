import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeBlindAssignments, parseScores, unblindScores, packStudy } from "../scripts/quality/blind_photo_study.mjs";

const seed = "private-test-seed-not-for-production";
const looks = ["hollywood", "electric-blue", "rhinestone"];
const rows = count => Array.from({length:count},(_,i)=>looks.map(look=>({
  sample_id:"subject-"+i,look_id:look,skin_group:["light","medium","deep"][i%3],
  candidate_file:"candidate.png",comparator_file:"comparator.png",
  consent_confirmed:true
}))).flat();

test("blinded study assignments are deterministic, matched and balanced by look plus skin depth",()=>{
  const trials = rows(31);
  const a=makeBlindAssignments(trials,seed);
  assert.deepEqual(a,makeBlindAssignments([...trials].reverse(),seed));
  assert.equal(a.length,93);
  for(const look of looks)for(const skin of ["light","medium","deep"]){
    const cell=a.filter(x=>x.look_id===look && x.skin_group===skin);
    const left=cell.filter(x=>x.candidate_side==="A").length;
    assert.ok(Math.abs(left-(cell.length-left))<=1);
  }
  assert.equal(new Set(a.map(x=>x.trial_id)).size,a.length);
  assert.ok(a.every(x=>/^t_[a-f0-9]{20}$/.test(x.trial_id)));
});

test("study pack rejects unconsented, incomplete, duplicate and contradictory subject rows",()=>{
  const source=rows(3);
  assert.throws(()=>makeBlindAssignments(source.slice(1),seed),/Incomplete/);
  assert.throws(()=>makeBlindAssignments([...source,source[0]],seed),/Duplicate/);
  assert.throws(()=>makeBlindAssignments(source.map((x,i)=>i===1?{...x,skin_group:"deep"}:x),seed),/Inconsistent/);
  assert.throws(()=>makeBlindAssignments(source.map((x,i)=>i===1?{...x,consent_confirmed:false}:x),seed),/Invalid consent/);
  assert.throws(()=>makeBlindAssignments(source,"weak"),/16-256/);
});

test("private answer key is needed to resolve A/B votes; raters cannot inflate subject counts",()=>{
  const assignments=makeBlindAssignments(rows(3),seed);
  const key={schema_version:1,assignments:assignments.map(a=>({
    trial_id:a.trial_id,sample_id:a.sample_id,skin_group:a.skin_group,
    look_id:a.look_id,candidate_side:a.candidate_side
  }))};
  const sheet=assignments.map(a=>({trial_id:a.trial_id,preferred:a.candidate_side,
    score_a:4,score_b:5}));
  const summary=unblindScores(key,[sheet,sheet]);
  assert.equal(summary.subjects,3);
  assert.equal(summary.cases.length,9);
  assert.ok(summary.cases.every(x=>x.paired_preference==="candidate" && x.rater_count===2));
  assert.ok(summary.cases.every(x=>x.artist_score===4 || x.artist_score===5));
  assert.equal(summary.requires_pixel_audits,true);
  const switched=sheet.map((x,i)=>i===0?{...x,preferred:x.preferred==="A"?"B":"A"}:x);
  const disagreement=unblindScores(key,[sheet,switched]);
  assert.equal(disagreement.cases.filter(x=>x.paired_preference==="tie").length,1);
  assert.throws(()=>unblindScores(key,[sheet]),/at least two/);
  assert.throws(()=>unblindScores(key,[sheet,sheet.slice(1)]),/every opaque trial/);
});

test("CSV input disallows missing grades, unknown choices and duplicate trial responses",()=>{
  const id="t_0123456789abcdef0123",header="trial_id,preferred,score_a,score_b\n";
  assert.deepEqual(parseScores(header+id+",A,4,5\n"),
    [{trial_id:id,preferred:"A",score_a:4,score_b:5}]);
  assert.throws(()=>parseScores(header+id+",B,4,\n"),/Invalid/);
  assert.throws(()=>parseScores(header+id+",X,4,5\n"),/Invalid/);
  assert.throws(()=>parseScores(header+id+",tie,4,5\n"+id+",tie,4,5\n"),/Repeated/);
});

test("generated reviewer pack hides candidate labels, leaves images local and refuses overwrite",async()=>{
  const dir=await fs.mkdtemp(join(tmpdir(),"hbeauty-private-study-"));
  try{
    const image=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lJ8AAAAASUVORK5CYII=","base64");
    await fs.writeFile(join(dir,"candidate.png"),image);
    await fs.writeFile(join(dir,"comparator.png"),image);
    const manifest=join(dir,"manifest.json"),output=join(tmpdir(),"hbeauty-blind-"+Date.now()+"-"+Math.floor(Math.random()*1e8));
    await fs.writeFile(manifest,JSON.stringify({schema_version:1,trials:rows(1).map(x=>({...x,challenge_tags:["glasses"]}))}));
    const pack=await packStudy(manifest,output,seed);
    assert.equal(pack.trials,3);
    const shown=JSON.parse(await fs.readFile(join(output,"reviewer","trials.json"),"utf8"));
    const key=JSON.parse(await fs.readFile(join(output,"private","answer-key.json"),"utf8"));
    assert.equal(shown.trials.length,3);
    assert.equal(key.assignments.length,3);
    assert.ok(key.assignments.every(x=>x.identical_image_pair === true),
      "same-byte images must be retained and tagged, not discarded");
    if (process.platform !== "win32") {
      assert.equal((await fs.stat(join(output,"reviewer","assets"))).mode & 0o777, 0o700);
      assert.equal((await fs.stat(join(output,"private","answer-key.json"))).mode & 0o777, 0o600);
    }
    assert.ok(!JSON.stringify(shown).includes("candidate_file"));
    assert.ok(!JSON.stringify(shown).includes("subject-0"));
    assert.ok(!JSON.stringify(shown).includes("hollywood"));
    assert.ok(!JSON.stringify(shown).includes("skin_group"));
    assert.ok(!JSON.stringify(shown).includes("glasses"));
    assert.ok(key.assignments.every(x=>x.challenge_tags.includes("glasses")));
    for(const row of shown.trials){
      assert.deepEqual(await fs.readFile(join(output,"reviewer",row.image_a)),image);
      assert.deepEqual(await fs.readFile(join(output,"reviewer",row.image_b)),image);
    }
    await assert.rejects(()=>packStudy(manifest,output,seed),/Refusing to overwrite/);
    await fs.rm(output,{recursive:true,force:true});
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
