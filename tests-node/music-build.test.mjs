import { test } from "node:test";
import assert from "node:assert/strict";
import { MUSIC_PATH, resolveMusicFlag } from "../scripts/build-salon.mjs";

test("licensed soundtrack automatically enables when installed", () => {
  assert.equal(resolveMusicFlag({ installed: true }), "true");
  assert.equal(resolveMusicFlag({ installed: true, configured: "auto" }), "true");
});

test("missing soundtrack safely leaves music disabled", () => {
  assert.equal(resolveMusicFlag({ installed: false }), "false");
  assert.equal(resolveMusicFlag({ installed: false, configured: "auto" }), "false");
});

test("explicit opt-out is honored even with the MP3 present", () => {
  assert.equal(resolveMusicFlag({ installed: true, configured: "false" }), "false");
});

test("explicit enable with missing file fails instead of silently shipping no music", () => {
  assert.throws(
    () => resolveMusicFlag({ installed: false, configured: "true" }),
    /\.mp3 is missing/
  );
});

test("invalid build flags fail closed and asset path is stable", () => {
  assert.equal(MUSIC_PATH, "public/audio/hananeh-salon-ambience.mp3");
  assert.throws(() => resolveMusicFlag({ installed: true, configured: "enabled" }), /VITE_SALON_MUSIC/);
});
