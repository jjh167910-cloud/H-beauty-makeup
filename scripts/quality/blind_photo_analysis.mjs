/**
 * Exploratory paired-realism diagnostics for the offline blind photo study.
 * Not a release gate: requires genuine consented photos, independent artists,
 * registered sampling and the separate pixel-integrity control benchmark.
 * Resample independent SUBJECTS, not the correlated three look comparisons
 * on each subject. Deterministic bootstrap enables reproducible audit output.
 */
import { createHash } from "node:crypto";

const LOOKS = ["hollywood", "electric-blue", "rhinestone"];
const SKINS = ["light", "medium", "deep"];
export const CHALLENGE_TAGS = ["hooded", "monolid", "profile", "glasses", "hair_occlusion", "low_light"];
const finite = n => typeof n === "number" && Number.isFinite(n);
const round = x => Math.round(x * 1e6) / 1e6;
const mean = a => a.reduce((s,x)=>s+x,0)/a.length;

function percentile(sorted, p) {
  const at=(sorted.length-1)*p, lo=Math.floor(at), hi=Math.ceil(at);
  return sorted[lo]*(1-(at-lo))+sorted[hi]*(at-lo);
}
function bootstrapSubjectMeans(subjectDeltas, group, draws = 2048) {
  if (subjectDeltas.length < 10) return null;
  const basis=group+"|"+subjectDeltas.join(",");
  const hashed=createHash("sha256").update(basis).digest();
  let state=hashed.readUInt32LE(0) || 0x9e3779b9;
  const next = () => {
    state^=state<<13; state^=state>>>17; state^=state<<5;
    return state>>>0;
  };
  const values=[];
  for(let d=0;d<draws;d++){
    let total=0;
    for(let i=0;i<subjectDeltas.length;i++)
      total+=subjectDeltas[next()%subjectDeltas.length];
    values.push(total/subjectDeltas.length);
  }
  values.sort((a,b)=>a-b);
  return { lower:round(percentile(values,0.025)), upper:round(percentile(values,0.975)),
    method:"subject-cluster percentile bootstrap", draws };
}

function sliceReport(cases,label) {
  const subjects=new Map();
  for(const c of cases){
    if(!subjects.has(c.sample_id))subjects.set(c.sample_id,[]);
    subjects.get(c.sample_id).push(c);
  }
  const subjectDeltas=[...subjects.entries()].sort(([a],[b])=>a.localeCompare(b))
    .map(([,r])=>mean(r.map(x=>x.paired_artist_delta)));
  const n=cases.length, won=cases.filter(x=>x.paired_preference==="candidate").length,
    lost=cases.filter(x=>x.paired_preference==="competitor").length,
    tied=n-won-lost;
  return {
    independent_subjects:subjects.size,
    paired_cases:n,
    candidate_preference:round(won/n),
    comparator_preference:round(lost/n),
    tie_rate:round(tied/n),
    candidate_artist_mean:round(mean(cases.map(x=>x.artist_score))),
    comparator_artist_mean:round(mean(cases.map(x=>x.comparator_artist_score))),
    paired_artist_delta:round(mean(subjectDeltas)),
    subject_cluster_ci95:bootstrapSubjectMeans(subjectDeltas,label),
    confidence_status:subjects.size>=10?"exploratory interval; not a release gate":"underpowered; fewer than 10 independent subjects"
  };
}

/**
 * Only private unblinded candidate/comparator scores enter this module.
 * No customer images or image paths. Every subject contributes equally to
 * the overall delta; the number of raters does not inflate subject count.
 */
export function analyzeBlindScores(cases) {
  if(!Array.isArray(cases)||cases.length===0)
    throw new Error("Nonempty unblinded paired cases required");
  const pairs=new Set(), subjectSkin=new Map(), subjectChallenge=new Map();
  for(const c of cases){
    if(!c||typeof c.sample_id!=="string"||!/^[A-Za-z0-9_-]{1,64}$/.test(c.sample_id)||
      !LOOKS.includes(c.look_id)||!SKINS.includes(c.skin_group)||
      !["candidate","competitor","tie"].includes(c.paired_preference)||
      !finite(c.artist_score)||!finite(c.comparator_artist_score)||
      c.artist_score<1||c.artist_score>5||
      c.comparator_artist_score<1||c.comparator_artist_score>5||
      !finite(c.paired_artist_delta)||
      Math.abs(c.paired_artist_delta-(c.artist_score-c.comparator_artist_score))>1e-8 ||
      (c.challenge_tags!==undefined &&
       (!Array.isArray(c.challenge_tags) ||
        c.challenge_tags.some(tag=>!CHALLENGE_TAGS.includes(tag)) ||
        new Set(c.challenge_tags).size!==c.challenge_tags.length)))
      throw new Error("Invalid private paired artist rating or group");
    const pair=c.sample_id+":"+c.look_id;
    if(pairs.has(pair))throw new Error("Duplicate subject/look paired rating");
    pairs.add(pair);
    const earlier=subjectSkin.get(c.sample_id);
    if(earlier && earlier!==c.skin_group)throw new Error("Inconsistent subject skin group");
    subjectSkin.set(c.sample_id,c.skin_group);
    const tags=[...(c.challenge_tags ?? [])].sort().join(",");
    if(subjectChallenge.has(c.sample_id) && subjectChallenge.get(c.sample_id)!==tags)
      throw new Error("Inconsistent subject challenge tags across looks");
    subjectChallenge.set(c.sample_id,tags);
  }
  const reports={ overall:sliceReport(cases,"overall"), by_look:{},
    by_skin:{},by_look_skin:{},by_challenge:{} };
  for(const look of LOOKS){
    const lookCases=cases.filter(c=>c.look_id===look);
    reports.by_look[look]=lookCases.length?sliceReport(lookCases,"look:"+look):null;
    reports.by_look_skin[look]={};
    for(const skin of SKINS){
      const group=lookCases.filter(c=>c.skin_group===skin);
      reports.by_look_skin[look][skin]=group.length?
        sliceReport(group,"look:"+look+"|skin:"+skin):null;
    }
  }
  for(const skin of SKINS){
    const group=cases.filter(c=>c.skin_group===skin);
    reports.by_skin[skin]=group.length?sliceReport(group,"skin:"+skin):null;
  }
  for(const tag of CHALLENGE_TAGS){
    const group=cases.filter(c=>(c.challenge_tags ?? []).includes(tag));
    reports.by_challenge[tag]=group.length?sliceReport(group,"challenge:"+tag):null;
  }
  const annotatedSubjects=new Set(cases.filter(c=>(c.challenge_tags??[]).length).map(c=>c.sample_id));
  return {
    schema_version:1,
    annotated_subjects:annotatedSubjects.size,
    annotation_warning:annotatedSubjects.size===0?
      "No challenge annotations: hard-case realism cannot be assessed":null,
    ...reports,
    inference_warning:"Descriptive subject-cluster bootstrap is exploratory; biased recruitment, repeated raters, photographic leakage and unverified consent can invalidate conclusions. Not proof of photorealism or a release certificate.",
  };
}
