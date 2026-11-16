/**
 * H-Beauty realism benchmark v2. No face files, image pixels or identities are uploaded.
 * This tool checks measurable engineering properties, NOT visual realism or legal rights.
 * Input: metadata exported locally from opt-in, consented benchmark sessions.
 *
 * CLI: node scripts/quality/benchmark_v2.mjs private/benchmark.json
 */
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const SKIN_GROUPS = ["light", "medium", "deep"];

const validCount = (n) => Number.isSafeInteger(n) && n >= 0;
const assertCount = (n, label) => {
  if (!validCount(n)) throw new TypeError(label + " must be a nonnegative integer");
};

/** Compare original and rendered RGBA pixels; mask is 8-bit (nonzero=editable).
 * Alpha changes outside the mask are forbidden; clipping is RGB-only.
 * Clipping introduced by makeup is not conflated with clipping in the source camera image.
 */
export function auditPixels({ before, after, mask, width, height }) {
  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0)
    throw new RangeError("Positive integer image dimensions required");
  const n = width * height;
  if (!before || !after || !mask || before.length !== n * 4 ||
      after.length !== n * 4 || mask.length !== n)
    throw new RangeError("Expected matched RGBA images and one mask byte per pixel");
  let outsideChangedPixels = 0, insideChangedPixels = 0, allowedPixels = 0;
  let borderMaskPixels = 0, introducedClippedChannels = 0, introducedNearClippedChannels = 0;
  let maxOutsideDelta = 0;
  for (let i = 0; i < n; i++) {
    const allowed = mask[i] > 0;
    if (allowed) {
      allowedPixels++;
      const x = i % width, y = Math.floor(i / width);
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) borderMaskPixels++;
    }
    let changed = false;
    for (let c = 0; c < 4; c++) {
      const b = before[i * 4 + c], a = after[i * 4 + c], delta = Math.abs(a - b);
      if (delta) changed = true;
      if (!allowed) maxOutsideDelta = Math.max(maxOutsideDelta, delta);
      if (allowed && c < 3) {
        if (b > 0 && b < 255 && (a === 0 || a === 255)) introducedClippedChannels++;
        if (b > 5 && b < 250 && (a <= 5 || a >= 250)) introducedNearClippedChannels++;
      }
    }
    if (changed) {
      if (allowed) insideChangedPixels++;
      else outsideChangedPixels++;
    }
  }
  return {
    width, height, allowedPixels, allowedCoverage: allowedPixels / n,
    insideChangedPixels, outsideChangedPixels, maxOutsideDelta, borderMaskPixels,
    introducedClippedChannels, introducedNearClippedChannels,
  };
}

/** Approximate 95% Wilson interval for independent binary decisions. */
export function wilson95(wins, trials) {
  assertCount(wins, "wins");
  assertCount(trials, "trials");
  if (wins > trials) throw new RangeError("wins cannot exceed trials");
  if (trials === 0) return { lower: 0, upper: 1 };
  const z = 1.959963984540054, p = wins / trials, z2 = z * z;
  const center = (p + z2 / (2 * trials)) / (1 + z2 / trials);
  const radius = z * Math.sqrt(p * (1 - p) / trials + z2 / (4 * trials * trials)) / (1 + z2 / trials);
  return { lower: Math.max(0, center - radius), upper: Math.min(1, center + radius) };
}

/**
 * Pilot gate uses one independent preference decision per (anonymous face, look),
 * not the number of individual rater clicks (which would inflate significance).
 * This is a pre-release evidence gate; an artist and a licensing review are still mandatory.
 */
export function evaluatePilot(cases, {
  minimumSubjects = 30, minimumLooks = 4, minimumSkinGroupSubjects = 5,
  minimumPreference = 0.70,
} = {}) {
  if (!Array.isArray(cases)) throw new TypeError("cases must be an array");
  const issues = [], incomplete = [], pairs = new Set(), subjects = new Set(), looks = new Set();
  const byLook = new Map(), bySkin = new Map(SKIN_GROUPS.map((s) => [s, new Set()]));
  const bySubjectVotes = new Map();
  const bySkinVotes = new Map(SKIN_GROUPS.map((s) => [s, { wins: 0, reviewed: 0, artistTotal: 0, artistN: 0 }]));
  let wins = 0, reviewed = 0;

  for (const [i, c] of cases.entries()) {
    if (!c || typeof c !== "object" || !/^[a-zA-Z0-9_-]{1,80}$/.test(c.sample_id ?? "") ||
        !/^[a-zA-Z0-9_-]{1,80}$/.test(c.look_id ?? "") || !SKIN_GROUPS.includes(c.skin_group)) {
      issues.push("Invalid anonymized case identifiers or skin group at index " + i);
      continue;
    }
    const pair = c.sample_id + ":" + c.look_id;
    if (pairs.has(pair)) issues.push("Duplicate independent face/look case at index " + i);
    pairs.add(pair); subjects.add(c.sample_id); looks.add(c.look_id);
    bySkin.get(c.skin_group).add(c.sample_id);
    byLook.set(c.look_id, (byLook.get(c.look_id) || 0) + 1);
    if (c.capture_type !== "consented_real_selfie") incomplete.push("Real, consented selfie evidence missing");
    if (c.blind_review !== true) incomplete.push("Blind review evidence missing");
    if (typeof c.artist_score !== "number" || !Number.isFinite(c.artist_score) ||
        c.artist_score < 1 || c.artist_score > 5) incomplete.push("Artist score missing or invalid");
    else {
      bySkinVotes.get(c.skin_group).artistTotal += c.artist_score;
      bySkinVotes.get(c.skin_group).artistN++;
      if (c.artist_score < 4) issues.push("Artist score below 4/5: " + c.look_id);
    }
    for (const key of ["outside_changed_pixels", "border_mask_pixels", "introduced_clipped_channels"]) {
      if (!validCount(c[key])) incomplete.push("Missing engineering measurement: " + key);
      else if (c[key] > 0) issues.push("Safety/quality violation: " + key + " for " + c.look_id);
    }
    const vote = c.paired_preference;
    if (vote === "candidate" || vote === "competitor" || vote === "tie") {
      reviewed++;
      const sw = bySubjectVotes.get(c.sample_id) || { wins: 0, reviewed: 0 };
      sw.reviewed++;
      bySubjectVotes.set(c.sample_id, sw);
      const subgroup = bySkinVotes.get(c.skin_group);
      subgroup.reviewed++;
      if (vote === "candidate") {
        wins++; sw.wins++; subgroup.wins++;
      }
    } else incomplete.push("Paired blind preference missing");
  }

  if (subjects.size < minimumSubjects) incomplete.push("Need at least " + minimumSubjects + " independent selfies");
  if (looks.size < minimumLooks) incomplete.push("Need at least " + minimumLooks + " pilot looks");
  for (const [look, count] of byLook) {
    if (count < minimumSubjects) incomplete.push("Too few independent subjects for look " + look);
  }
  for (const skin of SKIN_GROUPS) {
    if (bySkin.get(skin).size < minimumSkinGroupSubjects)
      incomplete.push("Too few independent subjects in skin group " + skin);
  }
  if (reviewed < minimumSubjects * minimumLooks)
    incomplete.push("Too few independently rated face/look comparisons");

  const preference = reviewed ? wins / reviewed : null;
  // Customer clusters are independent; repeated looks on one face are not.
  // A subject "wins" if her evaluated looks meet the predeclared 70% target.
  const subjectWins = [...bySubjectVotes.values()]
    .filter((v) => v.reviewed >= minimumLooks && v.wins / v.reviewed >= minimumPreference).length;
  const subjectWinInterval = wilson95(subjectWins, subjects.size);
  if (reviewed && preference < minimumPreference)
    issues.push("Blind preference below target");
  if (subjects.size && subjectWinInterval.lower <= 0.5)
    incomplete.push("Customer-cluster confidence does not yet exclude chance at 95%");
  const subgroupPreference = {};
  const artistMeans = [];
  for (const skin of SKIN_GROUPS) {
    const group = bySkinVotes.get(skin);
    subgroupPreference[skin] = group.reviewed ? group.wins / group.reviewed : null;
    if (group.reviewed && subgroupPreference[skin] < 0.5)
      issues.push("Blind preference below chance in skin group: " + skin);
    if (group.artistN) artistMeans.push(group.artistTotal / group.artistN);
  }
  if (artistMeans.length === SKIN_GROUPS.length &&
      Math.max(...artistMeans) - Math.min(...artistMeans) > 0.3)
    issues.push("Skin-group artist rating gap exceeds 0.3");

  const dedupe = (a) => [...new Set(a)];
  return {
    status: issues.length ? "fail" : incomplete.length ? "insufficient-evidence" : "pass",
    subjects: subjects.size, looks: looks.size, independentCases: pairs.size,
    skinGroupSubjects: Object.fromEntries([...bySkin].map(([k, s]) => [k, s.size])),
    wins, reviewed, preference, subjectWins, subjectWinWilson95: subjectWinInterval,
    subgroupPreference,
    issues: dedupe(issues), incomplete: dedupe(incomplete),
    requiresArtistSignoff: true, requiresLicenseReview: true,
    certification: "None: engineering and pilot evidence only; not proof of photorealism",
  };
}

async function main() {
  if (process.argv.length !== 3) {
    process.stderr.write("Usage: node scripts/quality/benchmark_v2.mjs <private-metadata.json>\n");
    process.exitCode = 2; return;
  }
  try {
    const data = JSON.parse(await readFile(process.argv[2], "utf8"));
    if (data.schema_version !== 2) throw new Error("Expected schema_version=2");
    const result = evaluatePilot(data.cases);
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    process.exitCode = result.status === "pass" ? 0 : 1;
  } catch (e) {
    process.stderr.write("Benchmark input error: " + e.message + "\n");
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
