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
