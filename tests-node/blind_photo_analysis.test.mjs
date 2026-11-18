import test from "node:test";
import assert from "node:assert/strict";
import { analyzeBlindScores } from "../scripts/quality/blind_photo_analysis.mjs";
import { makeBlindAssignments, unblindScores } from "../scripts/quality/blind_photo_study.mjs";

const looks=["hollywood","electric-blue","rhinestone"];
const skins=["light","medium","deep"];
function cases(subjectCount, candidate=5, comparator=2){
  return Array.from({length:subjectCount},(_,n)=>looks.map(look=>({
    sample_id:"S"+n,look_id:look,skin_group:skins[n%3],
    paired_preference:candidate>comparator?"candidate":candidate<comparator?"competitor":"tie",
    artist_score:candidate,comparator_artist_score:comparator,
    paired_artist_delta:candidate-comparator
  }))).flat();
}

test("paired photo diagnostics count independent subjects, not correlated looks",()=>{
  const x=analyzeBlindScores(cases(12));
  assert.equal(x.overall.independent_subjects,12);
  assert.equal(x.overall.paired_cases,36);
  assert.equal(x.overall.paired_artist_delta,3);
  assert.equal(x.overall.candidate_artist_mean,5);
  assert.equal(x.overall.comparator_artist_mean,2);
  assert.equal(x.overall.subject_cluster_ci95.lower,3);
  assert.equal(x.overall.subject_cluster_ci95.upper,3);
  assert.equal(x.by_look.hollywood.independent_subjects,12);
  assert.equal(x.by_skin.deep.independent_subjects,4);
  assert.equal(x.by_skin.deep.subject_cluster_ci95,null);
  assert.equal(x.by_look_skin.hollywood.medium.independent_subjects,4);
  assert.ok(x.inference_warning.includes("not proof")===false || x.inference_warning.includes("Not proof"));
});

test("underpowered and missing skin/look cells are descriptive only",()=>{
  const x=analyzeBlindScores(cases(3,4,4));
  assert.equal(x.overall.subject_cluster_ci95,null);
  assert.equal(x.overall.paired_artist_delta,0);
  assert.equal(x.overall.tie_rate,1);
  assert.equal(x.by_skin.deep.independent_subjects,1);
  assert.equal(x.by_skin.deep.subject_cluster_ci95,null);
  assert.equal(x.by_look_skin.rhinestone.light.paired_cases,1);
});

test("subject-level bootstrap is deterministic under trial reordering",()=>{
  const rows=cases(20).map((c,i)=>({
    ...c,artist_score: 2+(i%4),
    comparator_artist_score: 3,
    paired_artist_delta:(2+(i%4))-3
  }));
  const a=analyzeBlindScores(rows);
  const b=analyzeBlindScores([...rows].reverse());
  assert.deepEqual(a,b);
  assert.ok(a.overall.subject_cluster_ci95.lower<=a.overall.subject_cluster_ci95.upper);
});

test("reject duplicated subject/look, non-finite ratings, mismatched delta and inconsistent cohort",()=>{
  const data=cases(2);
  assert.throws(()=>analyzeBlindScores([...data,data[0]]),/Duplicate/);
  assert.throws(()=>analyzeBlindScores(data.map((x,i)=>i===0?{...x,artist_score:NaN}:x)),/Invalid/);
  assert.throws(()=>analyzeBlindScores(data.map((x,i)=>i===0?{...x,paired_artist_delta:7}:x)),/Invalid/);
  assert.throws(()=>analyzeBlindScores(data.map((x,i)=>i===1?{...x,skin_group:"deep"}:x)),/Inconsistent/);
});

test("unblinding reports real candidate-minus-comparator score and honest small-sample warning",()=>{
  const trials=Array.from({length:3},(_,n)=>looks.map(look=>({
    sample_id:"S"+n,look_id:look,skin_group:skins[n],
    candidate_file:"candidate.png",comparator_file:"comparator.png",consent_confirmed:true
  }))).flat();
  const assignments=makeBlindAssignments(trials,"test-seed-not-private-123456789");
  const key={schema_version:1,assignments:assignments.map(a=>({
    trial_id:a.trial_id,sample_id:a.sample_id,look_id:a.look_id,skin_group:a.skin_group,
    candidate_side:a.candidate_side
  }))};
  const sheet=assignments.map(a=>({
    trial_id:a.trial_id,preferred:a.candidate_side,
    score_a:a.candidate_side==="A"?5:2,
    score_b:a.candidate_side==="B"?5:2
  }));
  const scored=unblindScores(key,[sheet,sheet]);
  assert.equal(scored.subjects,3);
  assert.equal(scored.cases.length,9);
  assert.ok(scored.cases.every(c=>c.artist_score===5&&c.comparator_artist_score===2&&c.paired_artist_delta===3));
  assert.equal(scored.photo_realism_analysis.overall.subject_cluster_ci95,null);
  assert.equal(scored.photo_realism_analysis.overall.independent_subjects,3);
  assert.throws(()=>unblindScores(key,[sheet,sheet.map((x,i)=>i===0?{...x,score_a:6}:x)]),/Invalid/);
});


test("hard-case summaries are private, grouped by subject and not overclaimed",()=>{
  const source=cases(12).map(c=>({
    ...c,challenge_tags:Number(c.sample_id.slice(1))%2===0?
      ["hooded","glasses"]:["profile","low_light"]
  }));
  const report=analyzeBlindScores(source);
  assert.equal(report.annotated_subjects,12);
  assert.equal(report.by_challenge.hooded.independent_subjects,6);
  assert.equal(report.by_challenge.glasses.paired_cases,18);
  assert.equal(report.by_challenge.profile.independent_subjects,6);
  assert.equal(report.by_challenge.hair_occlusion,null);
  assert.equal(report.by_challenge.hooded.subject_cluster_ci95,null);
  assert.equal(report.annotation_warning,null);
  assert.throws(()=>analyzeBlindScores(source.map((x,i)=>i===0?
    {...x,challenge_tags:["unknown_condition"]}:x)),/Invalid/);
  assert.throws(()=>analyzeBlindScores(source.map((x,i)=>i===1?
    {...x,challenge_tags:["profile"]}:x)),/Inconsistent/);
});

test("matched blind study demands consistent challenge annotations per subject",()=>{
  const entries=Array.from({length:2},(_,n)=>looks.map(look=>({
    sample_id:"S"+n,skin_group:skins[n],look_id:look,
    candidate_file:"A.png",comparator_file:"B.png",consent_confirmed:true,
    challenge_tags:n===0?["glasses","hair_occlusion"]:["monolid"]
  }))).flat();
  const a=makeBlindAssignments(entries,"test-seed-not-private-123456789");
  assert.equal(a.filter(x=>x.challenge_tags.includes("glasses")).length,3);
  assert.throws(()=>makeBlindAssignments(entries.map((x,i)=>i===0?
    {...x,challenge_tags:["glasses","nonsense"]}:x),
    "test-seed-not-private-123456789"),/Invalid/);
  assert.throws(()=>makeBlindAssignments(entries.map((x,i)=>i===1?
    {...x,challenge_tags:["glasses"]}:x),
    "test-seed-not-private-123456789"),/Inconsistent/);
});
