import { test, expect } from "playwright/test";

test("eye geometry rejects crossed curves, missing lower lids and implausible brows without exceptions", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { nativeEyeMaterial, nativeEyeGeometryValid } =
      await import("/src/lib/material-eye-native.ts");
    const upper = [33,246,161,160,159,158,157,173,133];
    const brow = [70,63,105,66,107];
    const original = Array.from({ length: 478 }, () => [0,0,0]);
    for (let i = 0; i < upper.length; i++)
      original[upper[i]] = [120+15*i, 150-10*Math.sin(i*Math.PI/8),0];
    for (let i = 0; i < brow.length; i++)
      original[brow[i]] = [122+30*i,99+4*Math.abs(i-2),0];
    original[145] = [180,177,0];
    const check = (pts: number[][]) => ({
      valid: nativeEyeGeometryValid(pts, upper, brow),
      material: nativeEyeMaterial(pts,"hollywood","natural") !== null
    });
    const clone = () => original.map(p => p.slice());
    const crossed = clone();
    [crossed[161], crossed[158]] = [crossed[158],crossed[161]];
    const warped = clone();
    warped[160] = [380,125,0];
    const flattenedBrow = clone();
    for(let i=0;i<brow.length;i++)
      flattenedBrow[brow[i]] = [122+30*i,145,0];
    const crossedBrow = clone();
    [crossedBrow[70],crossedBrow[107]]=[crossedBrow[107],crossedBrow[70]];
    const invertedLower = clone();
    invertedLower[145] = [180,103,0];
    const missingLower = clone();
    (missingLower as any)[145]=undefined;
    const nonfiniteLower = clone();
    nonfiniteLower[145]=[NaN,0,0];
    const rotated = (deg: number) => {
      const r=deg*Math.PI/180,c=Math.cos(r),s=Math.sin(r);
      const p=clone();
      for(const id of [...upper,...brow,145]) {
        const [x,y] = p[id];
        p[id]=[180+(x-180)*c-(y-150)*s,
          150+(x-180)*s+(y-150)*c,0];
      }
      return check(p);
    };
    return {
      valid:check(original), crossed:check(crossed),warped:check(warped),
      flattenedBrow:check(flattenedBrow), crossedBrow:check(crossedBrow),
      invertedLower:check(invertedLower),missingLower:check(missingLower),
      nonfiniteLower:check(nonfiniteLower),
      rotated:[0,37,90,180,270].map(rotated)
    };
  });
  expect(result.valid).toEqual({valid:true,material:true});
  for(const key of ["crossed","warped","flattenedBrow","crossedBrow",
       "invertedLower","missingLower","nonfiniteLower"] as const)
    expect(result[key].material, key).toBe(false);
  expect(result.crossed.valid).toBe(false);
  expect(result.warped.valid).toBe(false);
  expect(result.flattenedBrow.valid).toBe(false);
  expect(result.crossedBrow.valid).toBe(false);
  for(const rotated of result.rotated)
    expect(rotated).toEqual({valid:true,material:true});
});


test("native geometry rejection also prevents the looser legacy CPU overlay fallback", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { nativeEyeLegacyFallbackAllowed, nativeEyeMaterial } =
      await import("/src/lib/material-eye-native.ts");
    const P = Array.from({ length: 478 }, () => [0,0,0]);
    const leftUpper = [33,246,161,160,159,158,157,173,133];
    const leftBrow = [70,63,105,66,107];
    const rightUpper = [263,466,388,387,386,385,384,398,362];
    const rightBrow = [300,293,334,296,336];
    leftUpper.forEach((id,i) => P[id]=[120+15*i,150-10*Math.sin(i*Math.PI/8),0]);
    leftBrow.forEach((id,i) => P[id]=[122+30*i,99+4*Math.abs(i-2),0]);
    rightUpper.forEach((id,i) => P[id]=[440-15*i,150-10*Math.sin(i*Math.PI/8),0]);
    rightBrow.forEach((id,i) => P[id]=[438-30*i,99+4*Math.abs(i-2),0]);
    P[145] = [180,177,0];
    P[374] = [380,177,0];
    const twoGood = nativeEyeLegacyFallbackAllowed(P,"rhinestone","natural");
    const bothEnabled = [...nativeEyeMaterial(P,"rhinestone","natural")!.enabled];
    const badFar = P.map(p => p.slice());
    badFar[374] = [NaN,177,0];
    const oneRejected = !nativeEyeLegacyFallbackAllowed(badFar,"rhinestone","natural");
    const remainingEye = [...nativeEyeMaterial(badFar,"rhinestone","natural")!.enabled];
    const allRejected = P.map(p => p.slice());
    allRejected[145] = [NaN,177,0];
    allRejected[374] = [NaN,177,0];
    const noneSafe = !nativeEyeLegacyFallbackAllowed(allRejected,"rhinestone","natural");
    const unknownStyle = !nativeEyeLegacyFallbackAllowed(P,"no-makeup","natural");
    return { twoGood, bothEnabled, oneRejected, remainingEye, noneSafe, unknownStyle };
  });
  expect(result.twoGood).toBe(true);
  expect(result.bothEnabled).toEqual([1,1]);
  expect(result.oneRejected).toBe(true);
  expect(result.remainingEye).toEqual([1,0]);
  expect(result.noneSafe).toBe(true);
  expect(result.unknownStyle).toBe(true);
});
