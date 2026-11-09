/** Dependency-free asset integrity gate. Run: node scripts/verify-images.mjs */
import { readFileSync, statSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(readFileSync(join(root, "src/data/catalog.json"), "utf8"));
const focal = readFileSync(join(root, "src/data/photo-focal.ts"), "utf8");
const families = new Set(), images = new Set(), problems = [];

for (const look of catalog) {
  if (!Number.isInteger(look.id) || families.has(look.id)) problems.push(`Duplicate/invalid family ${look.id}`);
  families.add(look.id);
  if (!Array.isArray(look.variantIds) || !look.variantIds.includes(look.repId))
    problems.push(`Representative image ${look.repId} missing from family ${look.id}`);
  for (const id of look.variantIds ?? []) {
    if (!Number.isInteger(id)) problems.push(`Invalid variant ID in family ${look.id}`);
    images.add(id);
  }
}

function verifyImage(id, small) {
  const file = join(root, "public/looks", ...(small ? ["sm"] : []), `${id}.webp`);
  if (!existsSync(file)) { problems.push(`Missing ${small ? "thumbnail" : "full"} photo ${id}`); return; }
  if (statSync(file).size < 28) { problems.push(`Empty image ${id}`); return; }
  const bytes = readFileSync(file);
  if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP")
    problems.push(`Invalid WebP signature for ${id}`);
}
for (const id of images) { verifyImage(id, false); verifyImage(id, true); }
for (const sub of ["", "sm"]) {
  for (const file of readdirSync(join(root, "public/looks", sub))) {
    const match = file.match(/^(\d+)\.webp$/);
    if (match && !images.has(Number(match[1]))) problems.push(`Orphan ${sub || "full"} photo: ${file}`);
  }
}

const entries = focal.match(/const FOCAL_X:[\s\S]*?=\s*\{([\s\S]*?)\};/);
if (!entries) problems.push("Focal map missing");
const adjusted = new Set();
for (const entry of (entries?.[1] ?? "").matchAll(/(\d+)\s*:\s*(\d+)/g)) {
  const id = Number(entry[1]), position = Number(entry[2]);
  if (!images.has(id)) problems.push(`Unknown focal photo ${id}`);
  if (adjusted.has(id)) problems.push(`Duplicate focal photo ${id}`);
  if (position < 0 || position > 100) problems.push(`Invalid focal offset ${id}: ${position}`);
  adjusted.add(id);
}

const manifest = JSON.parse(readFileSync(join(root, "public/manifest.webmanifest"), "utf8"));
for (const icon of manifest.icons ?? []) {
  const src = icon.src.replace(/^\//, "");
  if (!existsSync(join(root, "public", src))) problems.push(`PWA icon missing: ${src}`);
}
console.log(JSON.stringify({
  families: catalog.length,
  fullImages: images.size,
  thumbnails: images.size,
  adjustedFocalPositions: adjusted.size,
  failures: problems.length
}, null, 2));
for (const problem of problems) console.error("ASSET ERROR:", problem);
if (problems.length) process.exitCode = 1;
