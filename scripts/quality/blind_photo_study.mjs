/**
 * Private, local-only paired-photo study pack. Never include source photos,
 * the answer key, or reviewer ratings in Git; licensing is handled separately.
 * Node >=20. No networking, analytics or external packages.
 */
import * as fs from "node:fs/promises";
import { createHmac, randomBytes } from "node:crypto";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertPrivateImageContainer } from "./private_image_audit.mjs";

export const BEAUTY_LOOKS = ["hollywood", "electric-blue", "rhinestone"];
const SKINS = ["light", "medium", "deep"];
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const validId = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);
const hash = (seed, value) => createHmac("sha256", seed).update(value).digest("hex");
const inside = (root, target) => {
  const rel = relative(root, resolve(target));
  return rel === "" || (!rel.startsWith(".." + sep) && rel !== ".." && !isAbsolute(rel));
};
const privatePath = path => {
  if (inside(ROOT, path))
    throw new Error("Private study files and outputs must be OUTSIDE the Git repository");
};
const requireSeed = seed => {
  if (typeof seed !== "string" || seed.length < 16 || seed.length > 256)
    throw new Error("Use a private HBEAUTY_STUDY_SEED of 16-256 characters");
};
const byHash = (seed, label) => (a, b) =>
  hash(seed, label + a.sample_id + ":" + a.look_id)
    .localeCompare(hash(seed, label + b.sample_id + ":" + b.look_id));

/**
 * Reproducible, stratified counterbalancing. A/B sides differ by at most
 * one trial per look x skin-group stratum, and are never revealed to raters.
 */
export function makeBlindAssignments(trials, seed) {
  requireSeed(seed);
  if (!Array.isArray(trials) || !trials.length) throw new Error("Nonempty trials required");
  const unique = new Set(), subjects = new Map(), strata = new Map();
  for (const item of trials) {
    if (!item || !validId(item.sample_id) || !BEAUTY_LOOKS.includes(item.look_id) ||
        !SKINS.includes(item.skin_group) || item.consent_confirmed !== true ||
        typeof item.candidate_file !== "string" || !item.candidate_file ||
        typeof item.comparator_file !== "string" || !item.comparator_file ||
        item.candidate_file === item.comparator_file)
      throw new Error("Invalid consent, image pair, skin group or anonymous trial");
    const pair = item.sample_id + ":" + item.look_id;
    if (unique.has(pair)) throw new Error("Duplicate subject/look pair: " + pair);
    unique.add(pair);
    const subject = subjects.get(item.sample_id) || { skin: item.skin_group, looks: new Set() };
    if (subject.skin !== item.skin_group) throw new Error("Inconsistent skin group per subject");
    subject.looks.add(item.look_id);
    subjects.set(item.sample_id, subject);
    const group = item.look_id + ":" + item.skin_group;
    if (!strata.has(group)) strata.set(group, []);
    strata.get(group).push(item);
  }
  for (const [id, subject] of subjects) {
    if (subject.looks.size !== BEAUTY_LOOKS.length)
      throw new Error("Incomplete three-look matched cohort for subject " + id);
  }
  const out = [];
  for (const [group, set] of strata) {
    const sorted = [...set].sort(byHash(seed, "order:"));
    const start = parseInt(hash(seed, "start:" + group).slice(0, 2), 16) % 2;
    for (let index = 0; index < sorted.length; index++) {
      const item = sorted[index], candidate_side = (start + index) % 2 ? "A" : "B";
      const trial_id = "t_" + hash(seed, "trial:" + item.sample_id + ":" + item.look_id).slice(0, 20);
      out.push({ ...item, trial_id, candidate_side });
    }
  }
  if (new Set(out.map(x => x.trial_id)).size !== out.length)
    throw new Error("Opaque trial ID collision");
  return out.sort((a, b) =>
    hash(seed, "presentation:" + a.trial_id).localeCompare(hash(seed, "presentation:" + b.trial_id)));
}

/** A strict spreadsheet-safe scoring format with no free-text/image fields. */
export function parseScores(csv) {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.shift() !== "trial_id,preferred,score_a,score_b")
    throw new Error("Expected trial_id,preferred,score_a,score_b CSV header");
  const result = [], seen = new Set();
  for (const line of lines) {
    const row = line.split(",");
    if (row.length !== 4 || !/^t_[a-f0-9]{20}$/.test(row[0]) ||
        !["A", "B", "tie"].includes(row[1]) ||
        !["1", "2", "3", "4", "5"].includes(row[2]) ||
        !["1", "2", "3", "4", "5"].includes(row[3]))
      throw new Error("Invalid trial ID or incomplete blind score");
    if (seen.has(row[0])) throw new Error("Repeated trial in one rater sheet");
    seen.add(row[0]);
    result.push({ trial_id: row[0], preferred: row[1],
      score_a: Number(row[2]), score_b: Number(row[3]) });
  }
  return result;
}

/** Aggregate each subject/look once; repeated votes are NOT independent faces. */
export function unblindScores(key, raterSheets) {
  if (!key || key.schema_version !== 1 || !Array.isArray(key.assignments) ||
      !Array.isArray(raterSheets) || raterSheets.length < 2)
    throw new Error("A study answer key and at least two independent rater sheets are required");
  const assignments = key.assignments;
  const map = new Map(assignments.map(x => [x.trial_id, x]));
  if (map.size !== assignments.length) throw new Error("Duplicate answer-key trial");
  const ratings = raterSheets.map(sheet => {
    const byId = new Map(sheet.map(s => [s.trial_id, s]));
    if (byId.size !== map.size || sheet.length !== map.size ||
        [...byId.keys()].some(id => !map.has(id)))
      throw new Error("Each independent rater must score every opaque trial exactly once");
    return byId;
  });
  const cases = assignments.map(item => {
    if (!validId(item.sample_id) || !BEAUTY_LOOKS.includes(item.look_id) ||
        !SKINS.includes(item.skin_group) || !["A", "B"].includes(item.candidate_side))
      throw new Error("Invalid private answer key");
    const votes = { candidate: 0, comparator: 0, tie: 0 };
    let scoreSum = 0;
    for (const rating of ratings) {
      const row = rating.get(item.trial_id);
      if (row.preferred === "tie") votes.tie++;
      else if (row.preferred === item.candidate_side) votes.candidate++;
      else votes.comparator++;
      scoreSum += item.candidate_side === "A" ? row.score_a : row.score_b;
    }
    return { sample_id: item.sample_id, skin_group: item.skin_group,
      look_id: item.look_id, paired_preference:
        votes.candidate > votes.comparator ? "candidate" :
        votes.candidate < votes.comparator ? "competitor" : "tie",
      artist_score: scoreSum / ratings.length, votes, rater_count: ratings.length };
  });
  return { schema_version: 1, cases, subjects: new Set(cases.map(c => c.sample_id)).size,
    certification: "Not certified: combine with no-makeup controls, pixel audits, and consented real-photo provenance",
    requires_pixel_audits: true, requires_artist_signoff: true };
}

async function safeImage(base, name) {
  const path = resolve(base, name);
  if (!inside(base, path)) throw new Error("Image path escaped private input folder");
  const real = await fs.realpath(path);
  if (!inside(await fs.realpath(base), real)) throw new Error("Symlink escaped private input folder");
  const ext = extname(path).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext))
    throw new Error("Only local PNG, JPEG or WebP photos are accepted");
  const info = await fs.stat(real);
  if (!info.isFile() || info.size < 12 || info.size > 60 * 1024 * 1024)
    throw new Error("Invalid image size or file type");
  // Audit the exact bytes that will enter the reviewer pack. This avoids a
  // check-then-copy race and keeps encoded image pixels unchanged.
  const data = await fs.readFile(real);
  assertPrivateImageContainer(data, ext);
  return { data, ext };
}

export async function packStudy(manifestFile, outputDir, seed) {
  const manifestPath = resolve(manifestFile), out = resolve(outputDir);
  privatePath(manifestPath); privatePath(out);
  // Refuse alias/symlink paths that quietly resolve back into the source repo.
  privatePath(await fs.realpath(manifestPath));
  privatePath(await fs.realpath(dirname(out)));
  if (inside(dirname(manifestPath), out) || inside(out, dirname(manifestPath)))
    throw new Error("Put the output in a separate private folder, not inside the input images");
  const doc = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  if (doc.schema_version !== 1) throw new Error("Expected schema_version=1");
  const assignments = makeBlindAssignments(doc.trials, seed);
  if (await fs.stat(out).then(() => true, () => false))
    throw new Error("Refusing to overwrite an existing private study pack");
  const staging = out + ".partial-" + randomBytes(6).toString("hex");
  const review = join(staging, "reviewer"), assets = join(review, "assets");
  await fs.mkdir(assets, { recursive: true, mode: 0o700 });
  try {
    const exposed = [], key = [];
    for (const a of assignments) {
      const [candidate, comparator] = await Promise.all([
        safeImage(dirname(manifestPath), a.candidate_file),
        safeImage(dirname(manifestPath), a.comparator_file)]);
      const assetA = a.candidate_side === "A" ? candidate : comparator;
      const assetB = a.candidate_side === "B" ? candidate : comparator;
      const fileA = a.trial_id + "-A" + assetA.ext;
      const fileB = a.trial_id + "-B" + assetB.ext;
      await fs.writeFile(join(assets, fileA), assetA.data, { mode: 0o600 });
      await fs.writeFile(join(assets, fileB), assetB.data, { mode: 0o600 });
      exposed.push({ trial_id: a.trial_id, image_a: "assets/" + fileA,
        image_b: "assets/" + fileB });
      key.push({ trial_id: a.trial_id, sample_id: a.sample_id,
        look_id: a.look_id, skin_group: a.skin_group,
        candidate_side: a.candidate_side });
    }
    const csv = ["trial_id,preferred,score_a,score_b",
      ...exposed.map(x => x.trial_id + ",,,")].join("\n") + "\n";
    await fs.writeFile(join(review, "trials.json"),
      JSON.stringify({ schema_version: 1, trials: exposed }, null, 2), { mode: 0o600 });
    await fs.writeFile(join(review, "scoring-template.csv"), csv, { mode: 0o600 });
    await fs.writeFile(join(review, "README.txt"),
      "Private offline study only. Open each assets/...-A and ...-B pair in a local viewer.\n" +
      "Rate realism on each side from 1 to 5, then choose A/B/tie in scoring-template.csv.\n" +
      "Save a separate complete CSV for EACH independent makeup-artist reviewer.\n" +
      "Do not send this folder to public sites or commit it to GitHub.\n" +
      "Images are copied only after a fail-closed byte-level metadata gate.\n" +
      "This is NOT facial anonymization or independent consent verification.\n", { mode: 0o600 });
    await fs.mkdir(join(staging, "private"), { mode: 0o700 });
    await fs.writeFile(join(staging, "private", "answer-key.json"),
      JSON.stringify({ schema_version: 1, assignments: key }, null, 2), { mode: 0o600 });
    await fs.rename(staging, out);
    return { output: out, trials: key.length,
      note: "Local-only study pack; metadata-bearing or unsupported images are refused; visible identity and consent still require independent protection" };
  } catch (e) {
    await fs.rm(staging, { recursive: true, force: true });
    throw e;
  }
}

async function main() {
  const [command, a, b, ...rest] = process.argv.slice(2);
  try {
    if (command === "pack" && a && b && !rest.length) {
      const report = await packStudy(a, b, process.env.HBEAUTY_STUDY_SEED);
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    } else if (command === "score" && a && b && rest.length) {
      const key = JSON.parse(await fs.readFile(a, "utf8"));
      const sheets = await Promise.all([b, ...rest].map(async path =>
        parseScores(await fs.readFile(path, "utf8"))));
      process.stdout.write(JSON.stringify(unblindScores(key, sheets), null, 2) + "\n");
    } else {
      throw new Error("Usage: node scripts/quality/blind_photo_study.mjs pack <private-manifest.json> <private-output> (HBEAUTY_STUDY_SEED required) | score <private-answer-key.json> <rater1.csv> <rater2.csv> [...raters]");
    }
  } catch (err) {
    process.stderr.write("Private study error: " + err.message + "\n");
    process.exitCode = 2;
  }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  await main();
