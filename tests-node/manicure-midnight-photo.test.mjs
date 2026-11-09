import {readFileSync,existsSync} from "node:fs";
import {createHash} from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import {webpDimensions} from "../scripts/audit-nail-photo-candidates.mjs";

const path="public/nails/photos/nail-midnight-glitter.webp";
const sha="3ab3970a802027953b13ae56f8272c2cf992a93580c46737b9722d1f6dfac530";
test("individually reviewed Midnight Sparkle image is exact, full-resolution and separate from V4",()=>{
  assert.ok(existsSync(path),"Midnight Sparkle photo must be checked in");
  const bytes=readFileSync(path);
  assert.equal(createHash("sha256").update(bytes).digest("hex"),sha);
  assert.equal(readFileSync("assets/hbeauty-manicure-midnight-glitter.sha256","utf8").trim(),`${sha}  ${path}`);
  const d=webpDimensions(bytes);
  assert.equal(d.width,1600); assert.equal(d.height,1600);
  const nine=readFileSync("assets/hbeauty-nail-editorial-v4.sha256","utf8").trim().split(/\r?\n/);
  assert.equal(nine.length,9);
  assert.ok(!nine.some(line=>line.includes("nail-midnight-glitter")));
  assert.ok(!nine.some(line=>line.startsWith(sha)),"No duplicate of approved manicure photo");
});
test("midnight image is enabled only by explicit build flag, hashes and offline precache",()=>{
  const v=readFileSync("src/components/salon/nail-visual.tsx","utf8");
  const b=readFileSync("scripts/build-salon.mjs","utf8");
  const s=readFileSync("scripts/finalize-service-worker.mjs","utf8");
  assert.match(v,/VITE_MANICURE_MIDNIGHT_GLITTER/);
  assert.match(v,/nail-midnight-glitter\.webp/);
  assert.match(b,/Midnight-glitter manicure photo release checksum mismatch/);
  assert.match(s,/nail-midnight-glitter\.webp/);
  assert.match(s,/files\.push\(file\)/);
});
