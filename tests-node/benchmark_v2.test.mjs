import test from "node:test";
import assert from "node:assert/strict";
import { auditPixels, wilson95, evaluatePilot } from "../scripts/quality/benchmark_v2.mjs";

const blank = (w, h) => {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([80, 120, 160, 255], i * 4);
  return data;
};

test("pixel audit detects protected changes separately from makeup edits and clipping", () => {
  const before = blank(3, 3), after = before.slice(), mask = new Uint8Array(9);
  mask[4] = 255; // Only the centre is allowed. This also protects the border.
  after[4 * 4] = 255; // newly clipped inside
  after[0] = 81;      // one unauthorized border pixel
  const result = auditPixels({ before, after, mask, width: 3, height: 3 });
  assert.equal(result.outsideChangedPixels, 1);
  assert.equal(result.insideChangedPixels, 1);
  assert.equal(result.introducedClippedChannels, 1);
  assert.equal(result.introducedNearClippedChannels, 1);
  assert.equal(result.borderMaskPixels, 0);
  assert.equal(result.allowedPixels, 1);
  assert.equal(result.maxOutsideDelta, 1);
});

test("preexisting camera clipping is not falsely blamed on rendered cosmetics", () => {
  const before = blank(3, 3), after = before.slice(), mask = new Uint8Array(9);
  mask[4] = 255;
  before[4 * 4] = 255;
  after[4 * 4] = 255;
  after[4 * 4 + 1] = 121;
  const result = auditPixels({ before, after, mask, width: 3, height: 3 });
  assert.equal(result.introducedClippedChannels, 0);
  assert.equal(result.outsideChangedPixels, 0);
  assert.equal(result.insideChangedPixels, 1);
});

test("mask covering image boundary is flagged for review", () => {
  const before = blank(2, 2);
  const mask = Uint8Array.from([255, 0, 0, 0]);
  const result = auditPixels({ before, after: before.slice(), mask, width: 2, height: 2 });
  assert.equal(result.borderMaskPixels, 1);
});

test("pixel audit rejects dimensions that would silently misalign identity masks", () => {
  assert.throws(() => auditPixels({
    before: blank(2, 2), after: blank(2, 2), mask: new Uint8Array(3), width: 2, height: 2
  }), /matched RGBA/);
  assert.throws(() => auditPixels({
    before: [], after: [], mask: [], width: 0, height: 0
  }), /Positive integer/);
});

test("Wilson interval correctly handles zero, 100%, and uncertain preference", () => {
  assert.deepEqual(wilson95(0, 0), { lower: 0, upper: 1 });
  assert.equal(wilson95(0, 20).lower, 0);
  assert.equal(wilson95(20, 20).upper, 1);
  assert.ok(wilson95(7, 10).lower < 0.5);
  assert.ok(wilson95(80, 100).lower > 0.5);
  assert.throws(() => wilson95(11, 10), /wins cannot exceed/);
});

function pilotCases() {
  const looks = ["no-makeup", "hollywood", "electric-blue", "rhinestone"];
  const groups = ["light", "medium", "deep"];
  return Array.from({ length: 30 }, (_, i) => looks.map((look) => ({
    sample_id: "private-" + i,
    look_id: look,
    skin_group: groups[Math.floor(i / 10)],
    capture_type: "consented_real_selfie", // synthetic metadata fixture, not actual consent
    blind_review: true,
    artist_score: 4.5,
    outside_changed_pixels: 0,
    border_mask_pixels: 0,
    introduced_clipped_channels: 0,
    inside_changed_pixels: 0,
    paired_preference: look === "no-makeup" ? "tie" : "candidate",
  }))).flat();
}

test("full pilot metadata can pass quantitative gate but never self-certifies realism", () => {
  const result = evaluatePilot(pilotCases());
  assert.equal(result.status, "pass");
  assert.equal(result.subjects, 30);
  assert.equal(result.independentCases, 120);
  assert.deepEqual(result.skinGroupSubjects, { light: 10, medium: 10, deep: 10 });
  assert.equal(result.requiresArtistSignoff, true);
  assert.equal(result.requiresLicenseReview, true);
  assert.match(result.certification, /not proof/);
});

test("incomplete evidence cannot pass; a quality violation fails even with many ratings", () => {
  assert.equal(evaluatePilot(pilotCases().slice(0, 4)).status, "insufficient-evidence");
  const cases = pilotCases();
  cases[10].outside_changed_pixels = 1;
  assert.equal(evaluatePilot(cases).status, "fail");
  cases[10].outside_changed_pixels = 0;
  cases[10].artist_score = 3.8;
  assert.equal(evaluatePilot(cases).status, "fail");
  cases[10].artist_score = 4.5;
  cases[10].capture_type = "unknown";
  assert.equal(evaluatePilot(cases).status, "insufficient-evidence");
});

test("duplicate independent face/look comparisons are rejected", () => {
  const cases = pilotCases();
  cases.push({ ...cases[0] });
  assert.equal(evaluatePilot(cases).status, "fail");
});


test("confidence is clustered by independent customer, not inflated by repeated looks", () => {
  const cases = pilotCases();
  // 20 customers prefer H-Beauty on all looks; 10 on only two looks.
  // The per-face/look point estimate is 83%, but only 20/30 subjects
  // individually meet the 70% target. That is not conclusive at 95%.
  // Ten people spread across all skin groups lose two of three makeup
  // looks. Every look-by-skin cell remains at/above chance; this tests
  // customer-cluster uncertainty independently from subgroup regression.
  const losingSubjects = [0, 1, 2, 10, 11, 12, 20, 21, 22, 23];
  const makeupLooks = ["hollywood", "electric-blue", "rhinestone"];
  losingSubjects.forEach((subject, i) => {
    const lostLooks = [makeupLooks[i % 3], makeupLooks[(i + 1) % 3]];
    for (const look of lostLooks)
      cases.find((c) => c.sample_id === "private-" + subject && c.look_id === look).paired_preference = "competitor";
  });
  const result = evaluatePilot(cases);
  assert.ok(result.preference > 0.7);
  assert.equal(result.subjectWins, 20);
  assert.ok(result.subjectWinWilson95.lower < 0.5);
  assert.equal(result.status, "insufficient-evidence");
});

test("poor performance on deep skin fails despite an excellent aggregate score", () => {
  const cases = pilotCases();
  for (let subject = 20; subject < 30; subject++)
    for (const look of ["hollywood", "electric-blue"])
      cases.find((c) => c.sample_id === "private-" + subject && c.look_id === look).paired_preference = "competitor";
  const result = evaluatePilot(cases);
  assert.ok(result.preference >= 0.70);
  // Three active cosmetic looks are rated; two deliberate losses leave
  // deep-skin preference at one of three. The untouched control is excluded.
  assert.equal(result.subgroupPreference.deep, 1 / 3);
  assert.equal(result.status, "fail");
  assert.ok(result.issues.some((issue) => /deep/.test(issue)));
});


test("one badly performing look cannot hide behind an excellent overall win rate", () => {
  const cases = pilotCases();
  for (const c of cases)
    if (c.look_id === "rhinestone") c.paired_preference = "competitor";
  const result = evaluatePilot(cases);
  assert.equal(result.preference, 2 / 3);
  assert.equal(result.lookPreference.rhinestone, 0);
  assert.equal(result.lookPreference.hollywood, 1);
  assert.equal(result.status, "fail");
  assert.ok(result.issues.some((s) => s.includes("look: rhinestone")));
});

test("per-look confidence marks uncertain results even when the headline clears target", () => {
  const cases = pilotCases();
  // Each look wins on 22/30 independent people: point estimate exceeds 70%,
  // but the lower confidence bound must be computed and retained.
  for (const c of cases) {
    const person = Number(c.sample_id.split("-")[1]);
    if (person >= 22) c.paired_preference = "competitor";
  }
  const result = evaluatePilot(cases);
  assert.equal(result.preference, 22 / 30);
  assert.ok(result.lookWilson95.hollywood.lower > 0.5);
  assert.equal(result.subjectWins, 22);
});

test("disjoint subject groups cannot masquerade as a fully matched four-look pilot", () => {
  const cases = pilotCases().map(c => ({ ...c, sample_id: c.sample_id + "-" + c.look_id }));
  const result = evaluatePilot(cases);
  assert.equal(result.subjects, 120);
  assert.equal(result.independentCases, 120);
  assert.equal(result.completeSubjects, 0);
  assert.equal(result.ratedCompleteSubjects, 0);
  assert.equal(result.status, "insufficient-evidence");
  assert.ok(result.incomplete.some(s => /all four required pilot looks/.test(s)));
  assert.deepEqual(result.skinGroupSubjects, { light: 0, medium: 0, deep: 0 });
});

test("conflicting skin-depth metadata for the same subject is a hard failure", () => {
  const cases = pilotCases();
  cases[1].skin_group = "deep";
  const result = evaluatePilot(cases);
  assert.equal(result.status, "fail");
  assert.ok(result.issues.some(s => /Inconsistent skin group/.test(s)));
});

test("look-by-skin regressions cannot hide behind excellent marginal preference", () => {
  const cases = pilotCases();
  for (const c of cases)
    if (c.skin_group === "deep" && c.look_id === "rhinestone")
      c.paired_preference = "competitor";
  const result = evaluatePilot(cases);
  assert.ok(result.preference > 0.85);
  assert.ok(result.lookPreference.rhinestone > 0.5);
  assert.ok(result.subgroupPreference.deep > 0.5);
  assert.equal(result.lookSkinPreference.rhinestone.deep, 0);
  assert.equal(result.lookSkinPreference.hollywood.deep, 1);
  assert.equal(result.status, "fail");
  assert.ok(result.issues.some(s => /rhinestone \/ deep/.test(s)));
});

test("complete matched cohort and look-by-skin metrics preserve the passing pilot fixture", () => {
  const result = evaluatePilot(pilotCases());
  assert.equal(result.status, "pass");
  assert.equal(result.completeSubjects, 30);
  assert.equal(result.ratedCompleteSubjects, 30);
  assert.equal(result.lookSkinPreference["electric-blue"].medium, 1);
  assert.ok(result.lookSkinWilson95["electric-blue"].medium.lower > 0.5);
});

test("negative-control ties are not treated as cosmetic losses or fake wins", () => {
  const cases = pilotCases();
  const result = evaluatePilot(cases);
  assert.equal(result.status, "pass");
  assert.equal(result.untouchedControls, 30);
  assert.equal(result.beautyLooks, 3);
  assert.equal(result.reviewed, 90);
  assert.equal(result.wins, 90);
  assert.equal(result.lookPreference["no-makeup"], null);
  assert.equal(result.lookSkinPreference["no-makeup"].deep, null);
});

test("no-makeup control must have zero changed pixels, including editable regions", () => {
  const cases = pilotCases();
  const control = cases.find(c => c.sample_id === "private-0" && c.look_id === "no-makeup");
  control.inside_changed_pixels = 1;
  const changed = evaluatePilot(cases);
  assert.equal(changed.status, "fail");
  assert.ok(changed.issues.some(s => /No-makeup control changed/.test(s)));
  control.inside_changed_pixels = undefined;
  const unmeasured = evaluatePilot(cases);
  assert.equal(unmeasured.status, "insufficient-evidence");
  assert.ok(unmeasured.incomplete.some(s => /no-makeup control pixel/.test(s)));
});


test("identical photo pairs remain counted and cannot fabricate a beauty win", () => {
  const cases = pilotCases();
  const pair = cases.find(c => c.sample_id === "private-0" && c.look_id === "hollywood");
  pair.identical_image_pair = true;
  pair.comparator_artist_score = 4.5;
  const fabricated = evaluatePilot(cases);
  assert.equal(fabricated.status, "fail");
  assert.equal(fabricated.identicalMakeupPairs, 1);
  assert.equal(fabricated.reviewed, 90);
  assert.ok(fabricated.issues.some(s => /byte-identical A\/B images/.test(s)));

  // Genuine tie is retained in 90 decisions; it is not used as a fake win.
  pair.paired_preference = "tie";
  const neutral = evaluatePilot(cases);
  assert.equal(neutral.identicalMakeupPairs, 1);
  assert.equal(neutral.reviewed, 90);
  assert.equal(neutral.wins, 89);
  assert.equal(neutral.status, "pass");

  // Different realism grades for literally identical pixels are a rater-
  // protocol concern, even when the preference vote was marked as a tie.
  pair.comparator_artist_score = 2;
  const bias = evaluatePilot(cases);
  assert.equal(bias.status, "fail");
  assert.ok(bias.issues.some(s => /Artist realism score differs/.test(s)));
});
