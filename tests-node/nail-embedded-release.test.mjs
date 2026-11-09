import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructNailArchive, EXPECTED_ARCHIVE_SHA256, EXPECTED_ARCHIVE_BYTES } from "../scripts/restore-embedded-nail-v4.mjs";

test("GitHub source chunks reconstruct the exact nine-image approved archive",()=>{
  const result=reconstructNailArchive({write:false});
  assert.equal(result.bytes,EXPECTED_ARCHIVE_BYTES);
  assert.equal(result.bytes,395762);
  assert.equal(result.sha256,EXPECTED_ARCHIVE_SHA256);
  assert.equal(result.parts,11);
});

test("release manifest matches original ZIP's signed-off hash",()=>{
  assert.equal(EXPECTED_ARCHIVE_SHA256,
    "73618152697a6f8ff210179207e37ad321812ea233706b217ff7163ecda4ca89");
});
