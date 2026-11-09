/**
 * Production build with safe, automatic salon-music activation.
 *
 * The licensed MP3 is intentionally absent from the public repository until
 * uploaded by the owner. When its exact asset path is present, enable music
 * automatically in Vite and in the service-worker packaging step.
 */
import { spawnSync } from "node:child_process";
import { install as installReviewIntake } from "./install-manicure-intake-review.mjs";
import {ownerSelectedManicureIds} from "./owner-manicure-display.mjs";
import { existsSync, statSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { installNailPack } from "./install-nail-photo-pack.mjs";
import { installHairstyleIvory } from "./install-hairstyle-ivory.mjs";
import { installHb001Overlay } from "./install-hb001-overlay.mjs";
import { installPedicure78 } from "./install-pedicure-78-pack.mjs";
import { restorePedicureParts } from "./restore-pedicure-parts.mjs";
import { reconstructNailArchive } from "./restore-embedded-nail-v4.mjs";
import { LOCKS, loadPhotoLocks } from "./verify-all-nail-photos.mjs";
import {verifyManicureEditorialApprovals} from "./verify-manicure-editorial-approvals.mjs";
import { webpDimensions } from "./audit-nail-photo-candidates.mjs";

export const MUSIC_PATH = "public/audio/hananeh-salon-ambience.mp3";

export function resolveMusicFlag({ installed, configured } = {}) {
  if (configured != null && configured !== "" && !["true", "false", "auto"].includes(configured)) {
    throw new Error("VITE_SALON_MUSIC must be 'true', 'false', or 'auto'");
  }
  if (configured === "true" && !installed) {
    throw new Error(
      "VITE_SALON_MUSIC=true but public/audio/hananeh-salon-ambience.mp3 is missing. " +
      "Upload the licensed MP3 before publishing."
    );
  }
  if (configured === "false") return "false";
  return installed ? "true" : "false";
}

async function build() {
  // Original 60 source photos are release-denied and live ONLY in the review namespace.
  // The import fails closed on missing or altered external archives before Vite builds.
  await installReviewIntake();
  // Replace only the hairstyle backgrounds, using 584 checksum-locked assets.
  // All originals remain recoverable through the preceding Git revision.
  await installHairstyleIvory();
  // Keep the Vite dev server, production dist, and browser SHA tests on the
  // same exact HB-001 bytes. Vite serves /public; dist is rebuilt from it.
  // Missing/corrupt overlay fails closed before any build or visual test.
  if (installHb001Overlay("public")) console.log("Installed exact HB-001 portrait into Vite public asset tree");
  // User explicitly authorized all 146 originals for TEMPORARY customer
  // display. This deliberately does NOT create fabricated per-photo editorial
  // QA passes or rewrite pre-existing rejected/hold review evidence.
  const ownerSelectedManicure = ownerSelectedManicureIds();
  console.log("Owner-authorized temporary manicure display:",ownerSelectedManicure.length,
    "(not professionally editorial-certified)");

  const verifiedEmbeddedArchive = reconstructNailArchive();
  console.log(`Verified bundled salon photos: ${verifiedEmbeddedArchive.bytes} bytes, sha256 ${verifiedEmbeddedArchive.sha256}`);
  const installedPhotoPack = installNailPack();
  // Fail closed on partial/wrong pedicure photo uploads; preserve existing vector gallery otherwise.
  restorePedicureParts();
  const installedPedicure = installPedicure78();
  // Single independently reviewed manicure addition; preserve the nine-photo V4 lock.
  const midnightPath=resolve("public/nails/photos/nail-midnight-glitter.webp");
  const midnightLock=resolve("assets/hbeauty-manicure-midnight-glitter.sha256");
  const hasMidnightPhoto=existsSync(midnightPath), hasMidnightLock=existsSync(midnightLock);
  if(hasMidnightPhoto!==hasMidnightLock)throw new Error("Incomplete midnight-glitter photo release");
  const midnightEnabled=hasMidnightPhoto && hasMidnightLock;
  if(midnightEnabled) {
    const expected=readFileSync(midnightLock,"utf8").trim();
    const actual=createHash("sha256").update(readFileSync(midnightPath)).digest("hex");
    if(expected!==`${actual}  public/nails/photos/nail-midnight-glitter.webp`)
      throw new Error("Midnight-glitter manicure photo release checksum mismatch");
  }
  // Four native 1600px manicure photos, exact-ID mapped and independently SHA-locked.
  // Fail closed before Vite if any piece is missing or modified.
  const FOUR_LOCK=resolve("assets/hbeauty-manicure-four-20261029.sha256");
  const FOUR_IDS=["nail-atlas-botanical-ruby","nail-atlas-botanical-espresso","nail-lavender-chrome","nail-silver-chrome"];
  if(!existsSync(FOUR_LOCK))throw Error("Manicure four-photo release manifest missing");
  const fourLines=readFileSync(FOUR_LOCK,"utf8").trim().split(/\r?\n/);
  if(fourLines.length!==FOUR_IDS.length)throw Error("Manicure release manifest must contain exactly four photos");
  const fourHashes=new Set(),fourNames=new Set();
  for(const line of fourLines){
    const match=line.match(/^([a-f0-9]{64})  (public\/nails\/photos\/nail-[a-z0-9-]+\.webp)$/);
    if(!match)throw Error("Invalid manicure four-photo manifest entry");
    const id=match[2].slice("public/nails/photos/".length,-".webp".length);
    if(!FOUR_IDS.includes(id)||fourHashes.has(match[1])||fourNames.has(id))
      throw Error("Duplicate or unknown manicure four-photo ID");
    fourHashes.add(match[1]);fourNames.add(id);
    const asset=resolve(match[2]);
    if(!existsSync(asset))throw Error("Required manicure photo is missing: "+asset);
    const bytes=readFileSync(asset);
    if(bytes.length<25_000||bytes.length>2_200_000||
       bytes.toString("ascii",0,4)!=="RIFF"||bytes.toString("ascii",8,12)!=="WEBP"||
       createHash("sha256").update(bytes).digest("hex")!==match[1])
      throw Error("Manicure four-photo integrity failure: "+id);
  }
  if(fourNames.size!==FOUR_IDS.length)throw Error("Incomplete four-photo manicure release");

  // Seven full-resolution source photographs; strict all-or-nothing release.
  const BATCH7_LOCK=resolve("assets/hbeauty-manicure-batch7.sha256");
  const BATCH7_IDS=new Set(["nail-micro-french","nail-black-french","nail-cherry-french","nail-pink-ombre","nail-peach-ombre","nail-atlas-geometry-ivory","nail-atlas-foil-ivory"]);
  if(!existsSync(BATCH7_LOCK))throw Error("Manicure batch7 release lock missing");
  const batch7Lines=readFileSync(BATCH7_LOCK,"utf8").trim().split(/\r?\n/);
  if(batch7Lines.length!==7)throw Error("Manicure batch7 must contain exactly seven images");
  const batch7Found=new Set(),batch7Hashes=new Set();
  for(const line of batch7Lines){
    const match=line.match(/^([a-f0-9]{64})  (public\/nails\/photos\/nail-[a-z0-9-]+\.webp)$/);
    if(!match)throw Error("Malformed manicure batch7 lock entry");
    const id=match[2].slice("public/nails/photos/".length,-".webp".length);
    if(!BATCH7_IDS.has(id)||batch7Found.has(id)||batch7Hashes.has(match[1]))
      throw Error("Manicure batch7 contains unknown or duplicated designs");
    batch7Found.add(id);batch7Hashes.add(match[1]);
    const filePath=resolve(match[2]);
    if(!existsSync(filePath))throw Error("Missing manicure batch7 photo "+id);
    const bytes=readFileSync(filePath);
    if(bytes.length<25_000||bytes.length>2_200_000||
      bytes.toString("ascii",0,4)!=="RIFF"||bytes.toString("ascii",8,12)!=="WEBP"||
      createHash("sha256").update(bytes).digest("hex")!==match[1])
      throw Error("Manicure batch7 photo content mismatch "+id);
  }
  if(batch7Found.size!==7)throw Error("Incomplete manicure batch7 photo set");

  // Eight native 1600px photos, locked independently from the prior 21 manicures.
  const BATCH8_IDS = new Set(["nail-atlas-geometry-champagne","nail-atlas-botanical-pearl","nail-gold-french","nail-champagne","nail-rose-glitter","nail-modern-lines","nail-atlas-velvet-ruby","nail-atlas-velvet-champagne"]);
  const BATCH8_LOCK=resolve("assets/hbeauty-manicure-batch8.sha256");
  if(!existsSync(BATCH8_LOCK))throw Error("Manicure batch8 photo lock missing");
  const batch8Lines=readFileSync(BATCH8_LOCK,"utf8").trim().split(/\r?\n/);
  if(batch8Lines.length!==8)throw Error("Manicure batch8 must contain eight assets");
  const batch8Seen=new Set(),batch8Hashes=new Set();
  for(const line of batch8Lines){
    const m=line.match(/^([a-f0-9]{64})  (public\/nails\/photos\/nail-[a-z0-9-]+\.webp)$/);
    if(!m)throw Error("Malformed manicure batch8 SHA-256 entry");
    const id=m[2].slice("public/nails/photos/".length,-".webp".length);
    if(!BATCH8_IDS.has(id)||batch8Seen.has(id)||batch8Hashes.has(m[1]))
      throw Error("Duplicate or unknown manicure batch8 image ID");
    batch8Seen.add(id);batch8Hashes.add(m[1]);
    const target=resolve(m[2]);
    if(!existsSync(target))throw Error("Missing manicure batch8 photograph "+id);
    const bytes=readFileSync(target);
    if(bytes.length<25_000||bytes.length>2_200_000||
       bytes.toString("ascii",0,4)!=="RIFF"||bytes.toString("ascii",8,12)!=="WEBP"||
       createHash("sha256").update(bytes).digest("hex")!==m[1])
      throw Error("Manicure batch8 photograph checksum mismatch: "+id);
  }
  if(batch8Seen.size!==8)throw Error("Incomplete manicure batch8 photographic release");
  // 50-candidate review, Batch A: only ten design-matched photographs approved.
  // Fail before Vite on any missing or altered asset.
  const BATCH50_A_IDS=new Set(["nail-atlas-gradient-merlot","nail-atlas-prism-blush","nail-atlas-prism-champagne","nail-atlas-prism-coral","nail-atlas-prism-midnight","nail-atlas-prism-pearl","nail-atlas-prism-sage","nail-atlas-velvet-blush","nail-atlas-velvet-coral","nail-atlas-velvet-midnight"]);
  const BATCH50_A_LOCK=resolve("assets/hbeauty-manicure-batch50-a.sha256");
  if(!existsSync(BATCH50_A_LOCK))throw Error("Manicure batch50-A manifest missing");
  const batch50AEntries=readFileSync(BATCH50_A_LOCK,"utf8").trim().split(/\r?\n/);
  if(batch50AEntries.length!==10)throw Error("Batch50-A must contain exactly ten approved images");
  const b50Names=new Set(),b50Hashes=new Set();
  for(const line of batch50AEntries){
    const m=line.match(/^([a-f0-9]{64})  (public\/nails\/photos\/nail-[a-z0-9-]+\.webp)$/);
    if(!m)throw Error("Invalid Batch50-A checksum manifest");
    const id=m[2].slice("public/nails/photos/".length,-".webp".length);
    if(!BATCH50_A_IDS.has(id)||b50Names.has(id)||b50Hashes.has(m[1]))
      throw Error("Batch50-A duplicate/unknown manicure style ID");
    b50Names.add(id);b50Hashes.add(m[1]);
    const image=resolve(m[2]);if(!existsSync(image))throw Error("Missing Batch50-A photograph "+id);
    const b=readFileSync(image);
    if(b.length<25_000||b.length>2_200_000||b.toString("ascii",0,4)!=="RIFF"||b.toString("ascii",8,12)!=="WEBP"||
      createHash("sha256").update(b).digest("hex")!==m[1])throw Error("Batch50-A image integrity check failed "+id);
  }
  if(b50Names.size!==BATCH50_A_IDS.size)throw Error("Incomplete Batch50-A photo set");
  // Batch50B: nine native-resolution editorial photos promoted after exact-style QA.
  // A missing, duplicate, or altered image aborts the build before any deployment.
  const BATCH50B_IDS=new Set(["nail-atlas-modern-french-espresso","nail-atlas-foil-cobalt","nail-atlas-modern-french-merlot","nail-atlas-modern-french-sage","nail-atlas-modern-french-lavender","nail-rose-french","nail-atlas-magnetic-midnight","nail-atlas-magnetic-coral","nail-atlas-magnetic-pearl"]);
  const BATCH50B_LOCK=resolve("assets/hbeauty-manicure-batch50b.sha256");
  if(!existsSync(BATCH50B_LOCK))throw Error("Manicure Batch50B release lock missing");
  const batch50BLines=readFileSync(BATCH50B_LOCK,"utf8").trim().split(/\r?\n/);
  if(batch50BLines.length!==9)throw Error("Manicure Batch50B must contain nine images");
  const b50BNames=new Set(),b50BHashes=new Set();
  for(const line of batch50BLines){
    const m=line.match(/^([a-f0-9]{64})  (public\/nails\/photos\/nail-[a-z0-9-]+\.webp)$/);
    if(!m)throw Error("Malformed Batch50B manifest");
    const id=m[2].slice("public/nails/photos/".length,-".webp".length);
    if(!BATCH50B_IDS.has(id)||b50BNames.has(id)||b50BHashes.has(m[1]))
      throw Error("Batch50B duplicate or unknown style ID");
    b50BNames.add(id);b50BHashes.add(m[1]);
    const file=resolve(m[2]);
    if(!existsSync(file))throw Error("Missing Batch50B manicure photo "+id);
    const b=readFileSync(file);
    if(b.length<25_000||b.length>2_200_000||b.toString("ascii",0,4)!=="RIFF"||
      b.toString("ascii",8,12)!=="WEBP"||createHash("sha256").update(b).digest("hex")!==m[1])
      throw Error("Manicure Batch50B integrity failure "+id);
  }
  if(b50BNames.size!==BATCH50B_IDS.size)throw Error("Incomplete Batch50B manicure release");

  // Batch50C: eight native-resolution image masters. Fail closed before Vite:
  // the entire identified batch must be present and byte-exact.
  const BATCH50C_IDS=new Set(["nail-atlas-magnetic-espresso","nail-atlas-magnetic-sage","nail-atlas-geometry-blush","nail-atlas-prism-ivory","nail-atlas-gradient-pearl","nail-atlas-gradient-lavender","nail-atlas-gradient-ruby","nail-atlas-gradient-cobalt"]);
  const BATCH50C_LOCK=resolve("assets/hbeauty-manicure-batch50c.sha256");
  if(!existsSync(BATCH50C_LOCK))throw Error("Batch50C checksum lock missing");
  const batch50CLines=readFileSync(BATCH50C_LOCK,"utf8").trim().split(/\r?\n/);
  if(batch50CLines.length!==BATCH50C_IDS.size)throw Error("Batch50C requires exactly eight images");
  const batch50CSeen=new Set(),batch50CHashes=new Set();
  for(const line of batch50CLines){
    const m=line.match(/^([a-f0-9]{64})  (public\/nails\/photos\/nail-[a-z0-9-]+\.webp)$/);
    if(!m)throw Error("Malformed Batch50C checksum entry");
    const id=m[2].slice("public/nails/photos/".length,-".webp".length);
    if(!BATCH50C_IDS.has(id)||batch50CSeen.has(id)||batch50CHashes.has(m[1]))
      throw Error("Duplicate or unexpected manicure Batch50C asset");
    batch50CSeen.add(id);batch50CHashes.add(m[1]);
    const path=resolve(m[2]);
    if(!existsSync(path))throw Error("Missing Batch50C manicure photo "+id);
    const image=readFileSync(path);
    if(image.length<25000||image.length>2200000||image.toString("ascii",0,4)!=="RIFF"||
       image.toString("ascii",8,12)!=="WEBP"||
       createHash("sha256").update(image).digest("hex")!==m[1])
      throw Error("Batch50C photo checksum mismatch "+id);
  }
  if(batch50CSeen.size!==BATCH50C_IDS.size)throw Error("Incomplete Batch50C image release");

  // Two individually reviewed native-resolution originals, distinct from the
  // preexisting 56-manicure collection; fail closed before compiling the UI.
  const BATCH50D_IDS=new Set(["nail-berry-ombre","nail-atlas-velvet-ivory"]);
  const BATCH50D_LOCK=resolve("assets/hbeauty-manicure-batch50d.sha256");
  if(!existsSync(BATCH50D_LOCK))throw Error("Batch50D manicure lock missing");
  const batch50DLines=readFileSync(BATCH50D_LOCK,"utf8").trim().split(/\r?\n/);
  if(batch50DLines.length!==2)throw Error("Batch50D requires exactly two images");
  const dNames=new Set(),dHashes=new Set();
  for(const line of batch50DLines){
    const m=line.match(/^([a-f0-9]{64})  (public\/nails\/photos\/nail-[a-z0-9-]+\.webp)$/);
    if(!m)throw Error("Malformed Batch50D checksum entry");
    const id=m[2].slice("public/nails/photos/".length,-".webp".length);
    if(!BATCH50D_IDS.has(id)||dNames.has(id)||dHashes.has(m[1]))
      throw Error("Unexpected or duplicated Batch50D image");
    dNames.add(id);dHashes.add(m[1]);
    if(!existsSync(resolve(m[2])))throw Error("Missing Batch50D manicure photo "+id);
    const b=readFileSync(resolve(m[2]));
    if(b.length<25000||b.length>2200000||b.toString("ascii",0,4)!=="RIFF"||
       b.toString("ascii",8,12)!=="WEBP"||
       createHash("sha256").update(b).digest("hex")!==m[1])
      throw Error("Batch50D image checksum mismatch "+id);
  }
  if(dNames.size!==2)throw Error("Incomplete Batch50D manicure release");
  // Future manicure batches: one QA-approved SHA256 lock plus up to 50 original
  // high-resolution WebPs. No hard-coded per-batch UI/service-worker edits.
  // All published historical releases remain subject to loadPhotoLocks().
  const dynamicApproved=loadPhotoLocks()
    .filter(item=>!LOCKS.some(group=>group.name===item.group));
  if(dynamicApproved.length>162)
    throw Error("Dynamic manicure photo count exceeds catalog's remaining styles");
  const newNames=new Set(),newHashes=new Set();
  for(const item of dynamicApproved){
    if(item.kind!=="manicure"||newNames.has(item.id)||newHashes.has(item.hash))
      throw Error("Dynamic manicure duplicate or wrong category "+item.id);
    newNames.add(item.id);newHashes.add(item.hash);
    const photo=readFileSync(resolve(item.path));
    const d=webpDimensions(photo);
    if(photo.length<25_000||photo.length>2_200_000||
       photo.toString("ascii",0,4)!=="RIFF"||
       photo.toString("ascii",8,12)!=="WEBP"||
       d.width<1200||d.height<1200||d.width!==d.height||
       createHash("sha256").update(photo).digest("hex")!==item.hash)
      throw Error("Dynamic manicure native-quality release gate rejected "+item.id);
  }
  // Technical integrity never substitutes for a recorded per-image full-res QA decision.
  const editorial=verifyManicureEditorialApprovals(dynamicApproved);
  console.log("Future manicure release: "+editorial.approved+" QA-approved, SHA-locked new photos");
  const file = resolve(MUSIC_PATH);
  const installed = existsSync(file) && statSync(file).isFile();
  const configured = process.env.VITE_SALON_MUSIC;
  const enabled = resolveMusicFlag({ installed, configured });
  // Prefer quality-gated V4: only nine native high-resolution photographs;
  // the other 25 styles keep detailed and accurate SVG illustrations.
  // Legacy V2/V3 and four-photo releases continue working.
  const lockV2=readFileSync(resolve("assets/hbeauty-nail-editorial-v2.sha256"),"utf8");
  const lockV4=readFileSync(resolve("assets/hbeauty-nail-editorial-v4.sha256"),"utf8");
  const paths=contents=>contents.trim().split(/\r?\n/).map(line=>line.trim().split(/\s+/).at(-1));
  const all34=paths(lockV2);
  const selectedV4=paths(lockV4);
  if(all34.length!==34||selectedV4.length!==9)
    throw new Error("Nail photo lock must specify 34 original / 9 quality-approved assets");
  const count34=all34.filter(path=>existsSync(resolve(path))).length;
  const count9=selectedV4.filter(path=>existsSync(resolve(path))).length;
  let photoVersion=installedPhotoPack.edition ?? 2;
  if(!installedPhotoPack.edition && count34===34){
    const v3Lock=readFileSync(resolve("assets/hbeauty-nail-editorial-v3.sha256"),"utf8");
    const expected=v3Lock.split(/\r?\n/).find(line=>line.endsWith("public/nails/photos/nail-marble.webp"))?.split(/\s+/)[0];
    const actual=createHash("sha256").update(readFileSync(resolve("public/nails/photos/nail-marble.webp"))).digest("hex");
    if(expected===actual)photoVersion=3;
  } else if(!installedPhotoPack.edition && count34<34 && count9===9) photoVersion=4;
  const count=photoVersion===4?count9:count34;
  const expected=photoVersion===4?9:34;
  // V1's optional exact four-photo release remains supported.
  if(count!==expected && count>4)
    throw new Error(`Incomplete nail photo release: ${count}/${expected}`);
  if(process.env.VITE_NAIL_EDITORIAL_V2==="true" && count!==expected)
    throw new Error("Nail photo edition requested without complete verified pack");
  const nailEdition=count===expected?"true":"false";
  const env={...process.env,
    VITE_SALON_MUSIC:enabled,
    VITE_HB001_PRECACHE:existsSync(resolve("assets/hb001-overlay.sha256")) ? "true" : "false",
    VITE_PEDICURE_78:installedPedicure.installed ? "true" : "false",
    VITE_MANICURE_BATCH50_A:"true",
    VITE_MANICURE_BATCH50_B:"true",
    VITE_MANICURE_BATCH50_C:"true",
    VITE_MANICURE_DYNAMIC_IDS:dynamicApproved.map(item=>item.id).join(","),
    VITE_MANICURE_OWNER_VISIBLE_IDS:ownerSelectedManicure.join(","),
    VITE_MANICURE_BATCH50_D:"true",
    VITE_MANICURE_FOUR: "true",
    VITE_MANICURE_BATCH7: "true",
    VITE_MANICURE_BATCH8:"true",
    VITE_MANICURE_MIDNIGHT_GLITTER:midnightEnabled ? "true" : "false",
    VITE_NAIL_EDITORIAL_V2:nailEdition,
    VITE_NAIL_EDITORIAL_V3:nailEdition==="true" && photoVersion>=3?"true":"false",
    NAIL_EDITORIAL_LOCK_VERSION:String(photoVersion)};
  console.log(`Nail photographic edition: ${nailEdition==="true"?`v${photoVersion} (${expected} files)`:"vector-only / legacy optional 4-photo"}`);
  console.log(`Pedicure gallery: ${installedPedicure.installed ? "78 verified photos" : "vector fallback until full approved pack is installed"}`);
  console.log(`Salon music: ${enabled === "true" ? "ENABLED (asset found)" : "disabled (asset missing or explicit opt-out)"}`);
  if (enabled === "true") {
    console.log("Salon music checksum is verified during service-worker packaging.");
  }

  const stages = [
    [resolve("node_modules/vite/bin/vite.js"), "build"],
    [resolve("scripts/apply-hb001-overlay.mjs")],
    [resolve("scripts/finalize-service-worker.mjs")],
  ];
  for (const args of stages) {
    const result = spawnSync(process.execPath, args, { stdio: "inherit", env });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build().catch(error=>{console.error(error);process.exitCode=1;});
}
