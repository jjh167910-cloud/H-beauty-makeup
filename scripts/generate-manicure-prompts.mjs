/** H-Beauty manicure prompts v2: catalog-driven, standalone, and deterministic. */
import {readFileSync,writeFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"..");
export const GENERATOR_SETTINGS=Object.freeze({
  provider:"ElevenLabs",model_id:"flux-3-image",node_type:"image-generation",
  model_parameters:{aspect_ratio:"1:1",resolution:"2K"},
  generations_count:1,
  expected_native_shape:"square",minimum_native_width:1600,minimum_native_height:1600
});
const SHAPE={
  square:"SQUARE: visibly straight parallel sidewalls and a flat free edge with subtly softened corners; never almond or rounded tips.",
  oval:"OVAL: gently rounded elliptical free edge with naturally curved sidewalls, no point and no square corners.",
  almond:"ALMOND: smoothly tapering sides that meet a softly rounded almond point, not a sharp stiletto or flat coffin tip.",
  coffin:"COFFIN/BALLERINA: tapered sides ending in a clearly FLAT, straight narrow tip, not an almond point or wide square."
};
const LENGTH={
  short:"SHORT: approximately 1–2 mm free edge beyond the fingertip; compact, natural, practical nails.",
  medium:"MEDIUM: approximately 4–6 mm free edge beyond the fingertip; clearly longer than short, not dramatic extensions.",
  long:"LONG: approximately 8–12 mm free edge beyond the fingertip; elegant proportional extensions, not extreme claws."
};
const MOTIF={
  velvet:"All five nails have even, opaque velvety MATTE lacquer: diffuse powdery finish with no mirror highlights, no gloss, no glitter, no metallic sheen, no tips or decorative stripes. Keep the base color visually dominant.",
  gradient:"Smooth, airbrushed smoky OMBRÉ across EACH nail: controlled tonal fade from the base hue near the root into the pale accent hue toward the tip; no hard lines, spotted marble, French tip, or glitter.",
  "double-french":"Precise DOUBLE-LINE FRENCH: sheer natural nail-bed with two distinct hair-thin, parallel curved lines following the free edge, using the base hue and pale accent hue as fine tip details; uniform spacing, clear gap, aligned on each nail. Not a single thick tip.",
  foil:"Irregular SMALL asymmetric pieces of true metallic gold-leaf foil embedded in manicure lacquer on one to three accent nails; fine foil edges, with ample visible base-colored nail and no bulky gold jewelry or stones.",
  minimal:"MINIMAL DOT: exactly one tiny intentionally positioned accent dot near the cuticle on one or two nails; most of each nail remains clean glossy base with intentional negative space. No polka-dot arrays or gems.",
  geometry:"Fine, deliberate geometric strokes and restrained negative space on one to three nails; straight 0.5–1 mm lines and clean intersections, crisp hand-painted precision; no crowded zigzags, sticker typography, or random swirl.",
  botanical:"One fine hand-painted botanical sprig on one or two accent nails, with slender stems and distinct tiny tapered leaves; visible brushwork scaled to the nail; other nails restrained. Never flowers printed on the silk.",
  watercolor:"Soft translucent WATERCOLOR CLOUDS inside the nail polish: organic feathered pigment blooms with soft diffusion and overlapping washes on two to four nails; no hard marble veins and no printed background patterns.",
  beam:"Magnetic CAT-EYE GEL polish with one narrow, luminous DIAGONAL floating beam on every nail; depth from iron-oxide shimmer particles under glassy clearcoat, not chrome foil, silver stripes or glitter spots.",
  aura:"Soft centered AURA halo on each nail, an airbrushed radial luminous color bloom with a smooth falloff to the surrounding base shade; no sharp circles, ombré bands or printed icons.",
  jelly:"Tinted sheer JELLY GEL polish on all nails with convincing translucent depth and glossy glass-like surface; natural nail-bed faintly visible through color; no opaque cream base, glitter, or chrome.",
  pearls:"BRIDAL PEARL ART: delicate, narrow French-edge detailing with only a few tiny individually defined micro-pearl embellishments attached directly to one or two nail plates; pearls are smaller than 1.5 mm, not jewelry on fingers or silk.",
  leaves:"Fine, small layered translucent AUTUMN LEAF shapes on one or two nails, delicate fine veins in the accent tone and natural warm undertones; other nails remain calm. No leaves outside nails.",
  stars:"CELESTIAL STARS: tiny crisp five-point stars and sparse fine pinprick light dots set in very fine subtle shimmer on one or two nails, balanced negative space; not a random glitter blanket or galaxy background.",
  waves:"SCULPTED GEL WAVES: low-relief flowing raised gel ribbons physically built on the surface of two or three nails, delicate relief shadows along the ridges; the motif is on NAILS only, never molded onto skin, and not flat printed swirls."
};
const ORIGINAL={
  "nail-botanical":"CREAM BOTANICAL LINE: a warm cream base on all nails and slender muted sage line-art leafy stems on exactly two accent nails; the other nails remain clean cream. Clearly visible fine botanical lines.",
  "nail-sage-garden":"SAGE GARDEN: pale sage base coats with selective fine milky-white miniature leaf/bud detailing on exactly two accent nails. Clean garden-inspired detailing, not solid monochrome or a dense print.",
  "nail-lilac-bloom":"LILAC BLOOM: pastel lilac base, very small delicate five-petal lilac blossoms and tiny pale leaf details on exactly two accent nails; three matching simple base-colored nails; not oversized flowers or stickers.",
  "nail-cobalt-lines":"COBALT ACCENT: deep cobalt-blue base with precise thin ice-blue minimalist linear accents on exactly two nails; clean architectural edges and negative space, no dots or French borders."
};
export function validateQueue(queue){
  if(!queue||!Array.isArray(queue.batches)||queue.batches.length!==4)throw Error("Expected four original manicure batches");
  const styles=queue.batches.flatMap(b=>b.styles);
  if(styles.length!==162||queue.missing_photo_count!==162||new Set(styles.map(s=>s.id)).size!==162)
    throw Error("Catalog queue must contain 162 unique historical style IDs");
  for(const s of styles){
    if(!s.id?.startsWith("nail-")||!s.en||!s.description||!s.file_path||!/^#[0-9a-fA-F]{6}$/.test(s.base)||!/^#[0-9a-fA-F]{6}$/.test(s.accent)||!SHAPE[s.shape]||!LENGTH[s.length]||(s.qa_status!=="APPROVED"&&!(MOTIF[s.motif]||ORIGINAL[s.id])))
      throw Error("Invalid catalog image specification: "+s.id);
    const approved=s.qa_status==="APPROVED";
    if(approved){
      if(s.approved_by_qa!==true||!(/^[0-9a-f]{64}$/).test(s.sha256))throw Error("Approved entry has no verified SHA metadata: "+s.id);
    }else if(s.qa_status!=="NOT_GENERATED"||s.approved_by_qa!==false||s.sha256!==null)
      throw Error("Unsupported pending image QA state: "+s.id);
  }
  return styles;
}
export function renderPhotoBrief(style, art){
  const shapes={
    square:"rectangular silhouette, straight parallel sidewalls and a flat free edge with gently softened corners",
    oval:"softly curved elliptical tip with smooth rounded sidewalls",
    almond:"symmetrically tapered sidewalls ending in a softly rounded almond tip",
    coffin:"tapered ballerina sidewalls ending in a narrow, perfectly flat tip"
  };
  const lengths={
    short:"short free edge extending about 1–2 mm beyond the fingertip",
    medium:"medium free edge extending about 4–6 mm beyond the fingertip",
    long:"long proportional nail extension extending about 8–12 mm beyond the fingertip"
  };
  if(!shapes[style.shape]||!lengths[style.length]||!art)throw Error("Unresolved photographic specification");
  return [
    "A single high-end beauty photograph: one uninterrupted close-up camera exposure of one elegant adult woman's hand resting naturally, palm-down, on continuous ivory silk satin. Only this one hand and the fabric are in the photograph. The scene fills the entire image edge to edge.",
    "The hand has five anatomically natural, separate fingers, including the thumb, positioned in a relaxed fan so that every complete fingernail, cuticle and tip is visible. Realistic finger proportions, skin pores, fine creases, nail beds and naturally attached cuticles. The entire hand shares one consistent perspective and natural lighting.",
    "Each of the five nails has the same "+shapes[style.shape]+"; "+lengths[style.length]+". The main lacquer matches the color reference "+style.base+" with restrained accents matching "+style.accent+". Keep the intended "+style.finish+" finish on the actual nail plates. The manicure design is: "+art,
    "The entire ground and backdrop are a single uninterrupted expanse of softly folded pure ivory satin silk. The hand touches the silk along its full visible underside, and silk is visible beneath every fingertip, through every finger gap and out to all four corners. The fabric has smooth flowing weave and luminous soft folds.",
    "Professional macro editorial photography, a single 70-degree overhead three-quarter view, natural diagonal hand pose, hand occupying about three-quarters of the square image. Neutral studio daylight, diffuse softbox, gentle realistic contact shadows, precise salon-grade application, sharp detail across all five nails and natural satin highlights. An authentic-looking unmarked photograph with only the hand and ivory silk visible."
  ].join("\n\n");
}
export function makePrompt(style){
  if(style.qa_status==="APPROVED")throw Error("Already released: never regenerate an approved ID "+style.id);
  if(!(MOTIF[style.motif]||ORIGINAL[style.id])||!SHAPE[style.shape]||!LENGTH[style.length])throw Error("Unknown image specification: "+style.id);
  const art=style.motif==="original-brief"?ORIGINAL[style.id]:MOTIF[style.motif];
  return renderPhotoBrief(style,art);
}
export function buildRecords(queue){
  const styles=validateQueue(queue);
  return styles.filter(s=>s.qa_status!=="APPROVED").map(s=>({
    id:s.id,batch:queue.batches.find(b=>b.styles.some(x=>x.id===s.id)).batch,
    title:s.en,title_fa:s.title,output:s.file_path,model_settings:GENERATOR_SETTINGS,
    prompt:makePrompt(s),review_status:"PENDING_NATIVE_IMAGE_AND_EDITORIAL_QA"
  }));
}
export function renderBatch(queue,batch,index){
  validateQueue(queue);
  const pending=batch.styles.filter(x=>x.qa_status!=="APPROVED");
  const released=batch.styles.filter(x=>x.qa_status==="APPROVED");
  const result=[
    "# H-Beauty "+batch.batch+" — single-exposure photography prompts v3",
    "",
    "**"+pending.length+" image prompts pending / "+released.length+" released in original "+batch.styles.length+"-style cohort.** Exact status derives from docs/HBEAUTY_MANICURE_162_QUEUE.json. Do not regenerate already-published designs.",
    "",
    "## REQUIRED generator configuration (set in the model API, NOT merely inside the prompt)",
    "",
    "Provider ElevenLabs creative image-generation node; model FLUX 3 Image; aspect_ratio **1:1**; resolution **2K**; generations_count **1**. Verify the returned original image is genuinely square and at least 1600×1600 before any approval. Do not crop contact sheets or upscale a small source. Using a different model requires setting equivalent model-specific parameters and validating native dimensions.",
    "",
    "**Use exactly ONE fenced photographic prompt per generation call.** Only send text from within that one fence, never the document heading, catalog ID, numbered style title, entire batch file, QA criteria, or a list of styles. These metadata fields are for tracking only. Each generated image is AI-created style inspiration, not salon-work proof. Require full-resolution inspection, exact-style QA, duplicate comparison, SHA-256 locks and release verification.",
    "",
    "## Already published in this cohort (do not regenerate)",
    "",
    ...(released.length?released.map(s=>"- "+s.id+" — "+s.en+" (approved hash "+s.sha256+")"):["- None"]),
    "",
    "## Pending — individual ready-to-generate prompts",
    ""
  ];
  for(const s of pending){
    result.push("### "+String(index+batch.styles.indexOf(s)).padStart(3,"0")+" — "+s.en+" | "+s.title);
    result.push("");
    result.push("Catalog ID: "+s.id+" · Original photo output: "+s.file_path+" · STATUS: NOT GENERATED / NOT APPROVED");
    result.push("");
    result.push("~~~text");
    result.push(makePrompt(s));
    result.push("~~~");
    result.push("");
  }
  return result.join("\n")+"\n";
}
export function renderFiles(queue){
  validateQueue(queue);
  let index=1;
  return queue.batches.map(b=>{
    const path="docs/HBEAUTY_MANICURE_"+b.batch+"_PROMPTS.md";
    const content=renderBatch(queue,b,index);
    index+=b.styles.length;
    return {path,content};
  });
}
export function loadQueue(root=ROOT){
  return JSON.parse(readFileSync(resolve(root,"docs/HBEAUTY_MANICURE_162_QUEUE.json"),"utf8"));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),queue=loadQueue();
  if(args.includes("--json")){
    const idIndex=args.indexOf("--id");
    const records=buildRecords(queue);
    const output=idIndex>=0?records.filter(r=>r.id===args[idIndex+1]):records;
    if(idIndex>=0&&output.length!==1)throw Error("Unknown or already-approved ID: "+args[idIndex+1]);
    console.log(JSON.stringify(output,null,2));
  }else if(args.includes("--write")){
    for(const item of renderFiles(queue)){
      writeFileSync(resolve(ROOT,item.path),item.content);
      console.log("Updated "+item.path);
    }
  }else if(args.includes("--check")){
    for(const item of renderFiles(queue)){
      const current=readFileSync(resolve(ROOT,item.path),"utf8");
      if(current!==item.content)throw Error("Stale or altered manicure prompt file: "+item.path+"; regenerate with --write");
    }
    console.log("Verified all four manicure prompt batches and "+buildRecords(queue).length+" pending standalone prompts.");
  }else console.log("Use --json [--id nail-id], --write or --check");
}
