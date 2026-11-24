/**
 * Private benchmark-only catalog layer override.
 *
 * The exported WebP files are local experiment assets. Never write them back
 * into public/tryon/layers or change looks.json, service-worker cache versions,
 * or runtime code to run a candidate benchmark.
 */
const fs = require("node:fs");
const path = require("node:path");

const LOOK_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function prepareLayerOverride(dir, looks) {
  if (!dir) throw new Error("Expected nonempty --layer-dir");
  if (!Array.isArray(looks) || looks.length === 0) throw new Error("Missing benchmark looks");
  const absolute = path.resolve(dir);
  if (!fs.statSync(absolute, { throwIfNoEntry: false })?.isDirectory())
    throw new Error("Layer override is not a directory: " + absolute);
  const lookup = new Map();
  for (const id of looks) {
    if (typeof id !== "string" || !LOOK_ID.test(id)) throw new Error("Invalid look ID in benchmark manifest");
    if (lookup.has(id)) throw new Error("Duplicate look ID in manifest: " + id);
    const file = path.join(absolute, id + ".webp");
    if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile())
      throw new Error("Missing experimental atlas: " + id + ".webp");
    const buf = Buffer.alloc(12);
    const fd = fs.openSync(file, "r");
    try {
      if (fs.readSync(fd, buf, 0, 12, 0) !== 12
          || buf.toString("ascii", 0, 4) !== "RIFF"
          || buf.toString("ascii", 8, 12) !== "WEBP")
        throw new Error("Invalid WebP experimental atlas: " + id);
    } finally { fs.closeSync(fd); }
    lookup.set(id, file);
  }
  return lookup;
}

function resolveLayerRequest(url, lookup) {
  const pathname = new URL(url).pathname;
  const match = /^\/tryon\/layers\/([a-z0-9-]+)\.webp$/.exec(pathname);
  if (!match) return null;
  const file = lookup.get(match[1]);
  return file ? { id: match[1], file } : null;
}

module.exports = { prepareLayerOverride, resolveLayerRequest };
