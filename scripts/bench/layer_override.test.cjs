const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { prepareLayerOverride, resolveLayerRequest } = require("./layer_override.cjs");

const makeWebP = (dir, id) => {
  // A 12-byte RIFF/WebP header is enough for the manifest preflight test.
  // Browser tests separately decode the real image and check pixels.
  fs.writeFileSync(path.join(dir, id + ".webp"),
    Buffer.from([82,73,70,70,4,0,0,0,87,69,66,80]));
};
const withDir = fn => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hbeauty-private-override-"));
  try { return fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
};

test("resolves only look atlases from the explicit local variant set", () => withDir(dir => {
  makeWebP(dir, "icy");
  makeWebP(dir, "cut-crease");
  const lookup = prepareLayerOverride(dir, ["icy", "cut-crease"]);
  assert.deepEqual(resolveLayerRequest("http://127.0.0.1:4180/tryon/layers/icy.webp?v=11", lookup),
    { id: "icy", file: path.join(dir, "icy.webp") });
  assert.equal(resolveLayerRequest("http://127.0.0.1:4180/tryon/layers/other.webp?v=11", lookup), null);
  assert.equal(resolveLayerRequest("http://127.0.0.1:4180/tryon/cov/icy.webp", lookup), null);
  assert.equal(resolveLayerRequest("http://127.0.0.1:4180/assets/icy.webp", lookup), null);
  assert.equal(resolveLayerRequest("http://127.0.0.1:4180/tryon/layers/icy.png", lookup), null);
}));

test("fails closed if any expected candidate atlas is absent", () => withDir(dir => {
  makeWebP(dir, "icy");
  assert.throws(() => prepareLayerOverride(dir, ["icy", "mod-60s"]), /Missing experimental atlas: mod-60s/);
}));

test("rejects invalid WebP headers and directories masquerading as images", () => withDir(dir => {
  fs.writeFileSync(path.join(dir, "icy.webp"), "not an image");
  assert.throws(() => prepareLayerOverride(dir, ["icy"]), /Invalid WebP/);
  fs.rmSync(path.join(dir, "icy.webp"));
  fs.mkdirSync(path.join(dir, "icy.webp"));
  assert.throws(() => prepareLayerOverride(dir, ["icy"]), /Missing experimental atlas/);
}));

test("rejects duplicate look IDs and path traversal in any benchmark manifest", () => withDir(dir => {
  makeWebP(dir, "icy");
  assert.throws(() => prepareLayerOverride(dir, ["icy", "icy"]), /Duplicate look ID/);
  assert.throws(() => prepareLayerOverride(dir, ["../secrets"]), /Invalid look ID/);
  assert.throws(() => prepareLayerOverride(dir, ["icy.webp"]), /Invalid look ID/);
}));

test("rejects a non-directory or an empty candidate set", () => withDir(dir => {
  assert.throws(() => prepareLayerOverride(path.join(dir, "missing"), ["icy"]), /not a directory/);
  assert.throws(() => prepareLayerOverride(dir, []), /Missing benchmark looks/);
}));
