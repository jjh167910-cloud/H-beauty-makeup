import test from "node:test";
import assert from "node:assert/strict";
import {rgbPixelDifference,edgeHashDifference} from "../scripts/review-nail-photo-pixels.mjs";

test("pixel-level intake catches visually identical images even when binary hashes differ",()=>{
  assert.equal(rgbPixelDifference([0,120,255,12,24,36],[0,120,255,12,24,36]),0);
  // Differences under .045 are not distinct enough to promote automatically.
  assert.ok(rgbPixelDifference([128,128,128],[132,132,132])<.045);
  assert.ok(rgbPixelDifference([128,128,128],[255,0,0])>.045);
});

test("pixel comparator is normalized, bounded and refuses invalid input",()=>{
  assert.equal(rgbPixelDifference([0,0,0],[255,255,255]),1);
  assert.throws(()=>rgbPixelDifference([],[]),/nonempty/);
  assert.throws(()=>rgbPixelDifference([0,1],[0]),/same nonempty/);
  assert.throws(()=>rgbPixelDifference([0,256],[0,255]),/invalid channel/);
  assert.throws(()=>rgbPixelDifference([NaN],[3]),/invalid channel/);
});

test("recolored-image dHash diagnostic measures composition similarity independently of RGB",()=>{
  assert.equal(edgeHashDifference("0000000000000000","0000000000000000"),0);
  assert.equal(edgeHashDifference("ffffffffffffffff","0000000000000000"),64);
  assert.equal(edgeHashDifference("0000000000000001","0000000000000000"),1);
  assert.throws(()=>edgeHashDifference("invalid","0000000000000000"),/16 hexadecimal/);
});
