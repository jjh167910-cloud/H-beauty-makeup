import { test, expect } from "playwright/test";

test("native eye lens softness and fail-closed geometry preserve safe photo rendering", async ({ page }) => {
  await page.goto("/");
  const data = await page.evaluate(async () => {
    const { nativeEyeMaterial, nativeEyeScissor, nativeEyeGeometryValid } =
      await import("/src/lib/material-eye-native.ts");
    const pts = Array.from({length:478},()=>[0,0,0]);
    const lu=[33,246,161,160,159,158,157,173,133];
    const ru=[263,466,388,387,386,385,384,398,362];
    const lb=[70,63,105,66,107], rb=[300,293,334,296,336];
    lu.forEach((id,i)=>pts[id]=[120+15*i,150-10*Math.sin(i*Math.PI/8),0]);
    ru.forEach((id,i)=>pts[id]=[440-15*i,150-10*Math.sin(i*Math.PI/8),0]);
    lb.forEach((id,i)=>pts[id]=[122+30*i,99+4*Math.abs(i-2),0]);
    rb.forEach((id,i)=>pts[id]=[438-30*i,99+4*Math.abs(i-2),0]);
    pts[145]=[180,177,0]; pts[374]=[380,177,0];
    const sharp=nativeEyeMaterial(pts,"rhinestone","natural");
    const blurred=nativeEyeMaterial(pts,"rhinestone","natural",3.4);
    const max=nativeEyeMaterial(pts,"rhinestone","natural",Infinity);
    const capped=nativeEyeMaterial(pts,"rhinestone","natural",1e6);
    const sharpR=sharp && nativeEyeScissor(sharp,640,320);
    const blurR=blurred && nativeEyeScissor(blurred,640,320);
    const bad=pts.map(p=>p.slice()); bad[105]=[182,170,0];
    const overlapping=pts.map(p=>p.slice());
    ru.forEach((id,i)=>overlapping[id]=pts[lu[8-i]].slice());
    rb.forEach((id,i)=>overlapping[id]=pts[lb[4-i]].slice());
    overlapping[374]=pts[145].slice();
    return {
      sharp:sharp?.inkSoft,blurred:blurred?.inkSoft,
      max:max?.inkSoft,capped:capped?.inkSoft,
      sharpR,blurR,
      valid:nativeEyeGeometryValid(pts,lu,lb),
      invalidBrow:nativeEyeGeometryValid(bad,lu,lb),
      enabledBad:nativeEyeMaterial(bad,"rhinestone","natural")?.enabled[0],
      validOverlap: nativeEyeGeometryValid(overlapping,lu,lb) &&
        nativeEyeGeometryValid(overlapping,ru,rb),
      rejectedOverlap:nativeEyeMaterial(overlapping,"rhinestone","natural")===null,
      noMakeup:nativeEyeMaterial(pts,"no-makeup","natural",3.4)===null
    };
  });
  expect(data.sharp).toBe(0.7);
  expect(data.max).toBe(0.7);
  expect(data.capped).toBe(3.5);
  expect(data.blurred).toBeCloseTo(2.72);
  expect(data.valid).toBe(true);
  expect(data.invalidBrow).toBe(false);
  expect(data.enabledBad).toBe(0);
  expect(data.validOverlap).toBe(true);
  expect(data.rejectedOverlap).toBe(true);
  expect(data.noMakeup).toBe(true);
  expect(data.sharpR).toBeTruthy();
  expect(data.blurR).toBeTruthy();
  const [sx,sy,sw,sh]=data.sharpR!;
  const [bx,by,bw,bh]=data.blurR!;
  expect(bx).toBeLessThanOrEqual(sx);
  expect(by).toBeLessThanOrEqual(sy);
  expect(bx+bw).toBeGreaterThanOrEqual(sx+sw);
  expect(by+bh).toBeGreaterThanOrEqual(sy+sh);
});
