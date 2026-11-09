import test from "node:test";
import assert from "node:assert/strict";
import {GENERATOR_SETTINGS,makePrompt,renderFiles,buildRecords,validateQueue,loadQueue} from "../scripts/generate-manicure-prompts.mjs";
const queue=loadQueue(),rows=validateQueue(queue),pending=rows.filter(x=>x.qa_status!=="APPROVED");
test("remaining prompts are derived from approved queue membership and exclude released photo IDs",()=>{
  const records=buildRecords(queue);
  assert.equal(rows.length,162);
  const approved=rows.filter(s=>s.qa_status==="APPROVED");
  assert.equal(approved.length+pending.length,162);
  assert.ok(approved.length>=12,"The original 12 published queue entries must remain approved");
  assert.equal(records.length,pending.length);
  assert.equal(new Set(records.map(x=>x.id)).size,pending.length);
  assert.ok(!records.some(r=>r.id==="nail-rose-chrome"));
  for(const s of approved)assert.ok(!records.some(r=>r.id===s.id),"Approved style was accidentally scheduled: "+s.id);
});
test("each generated prompt is a single camera exposure with no multi-image or labeling cues",()=>{
  for(const s of pending){
    const p=makePrompt(s);
    for(const marker of ["single high-end beauty photograph","one uninterrupted close-up camera exposure","five anatomically natural","including the thumb","pure ivory satin silk","single 70-degree overhead",s.base,s.accent])
      assert.ok(p.includes(marker),"Missing "+marker+" for "+s.id);
    assert.equal(p.includes(s.id),false,"Catalog ID leaked to image model: "+s.id);
    assert.equal(p.includes(s.en),false,"Style title leaked into image model: "+s.id);
    assert.doesNotMatch(p,/contact sheet|collage|grid|poster|infographic|catalog|watermark|label|panels|comparison|style ID|\\b(?:image one|image two)\\b/i);
    assert.ok(p.length>=900&&p.length<=3400,"Uncontrolled prompt length for "+s.id);
  }
});
test("source records keep tracking labels separate from the photographic prompt",()=>{
  for(const r of buildRecords(queue)){
    assert.ok(r.title&&r.title_fa&&r.id&&r.output);
    assert.equal(r.prompt.includes(r.id),false);
    assert.equal(r.prompt.includes(r.title),false);
  }
});
test("each motif family has a meaningful specific instruction",()=>{
  const a=makePrompt(pending.find(x=>x.motif==="velvet"));
  const b=makePrompt(pending.find(x=>x.motif==="double-french"));
  const c=makePrompt(pending.find(x=>x.motif==="watercolor"));
  assert.match(a,/opaque velvety MATTE/);
  assert.match(b,/two distinct hair-thin, parallel/);
  assert.match(c,/Soft translucent WATERCOLOR CLOUDS/);
  assert.ok(!a.includes("Render the characteristic motif"));
});
test("square nail geometry is independent of medium or long catalog length",()=>{
  const square=pending.filter(s=>s.shape==="square");
  assert.ok(square.some(s=>s.length==="medium"));
  assert.ok(square.some(s=>s.length==="long"));
  for(const s of square){
    const prompt=makePrompt(s);
    assert.match(prompt,/rectangular silhouette, straight parallel sidewalls and a flat free edge/);
    assert.doesNotMatch(prompt,/short rectangular silhouette/);
    const lengthPhrase={short:"short free edge",medium:"medium free edge",long:"long proportional nail extension"}[s.length];
    assert.ok(prompt.includes(lengthPhrase),"Missing correct "+s.length+" length for "+s.id);
  }
});
test("settings require explicit native square 2K, not text-only guess",()=>{
  assert.equal(GENERATOR_SETTINGS.model_parameters.aspect_ratio,"1:1");
  assert.equal(GENERATOR_SETTINGS.model_parameters.resolution,"2K");
  assert.ok(GENERATOR_SETTINGS.minimum_native_width>=1600);
});
test("all four generated docs fully cover the original 162-style cohort",()=>{
  const rendered=renderFiles(queue);
  assert.equal(rendered.length,4);
  assert.equal(rendered.filter(x=>x.content.includes("generator configuration")).length,4);
  for(const f of rendered) assert.ok(f.content.includes("~~~text"));
  assert.throws(()=>makePrompt(rows.find(x=>x.qa_status==="APPROVED")),/Already released/);
});
test("fail closed on stale approval or unsupported catalog shape",()=>{
  const bad=structuredClone(queue);
  bad.batches[0].styles.find(x=>x.qa_status!=="APPROVED").shape="stiletto";
  assert.throws(()=>validateQueue(bad),/Invalid catalog/);
  const bad2=structuredClone(queue);
  bad2.batches[0].styles.find(x=>x.qa_status!=="APPROVED").approved_by_qa=true;
  assert.throws(()=>validateQueue(bad2),/Unsupported pending/);
});
