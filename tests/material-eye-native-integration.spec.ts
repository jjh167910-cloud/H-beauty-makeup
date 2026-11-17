import { test, expect } from "playwright/test";

/**
 * Real rendering integration smoke test using the repository's pre-existing
 * generated catalog base face (no customer photo, no external API calls).
 *
 * Unlike isolated shader tests, this exercises preparePhoto -> paintLook ->
 * MakeupGL.render -> same-context native material postpass.
 */
test("opt-in native shader runs through the full saved-photo MakeupGL pipeline, with exact surrounding pixels", async ({ page }) => {
  test.setTimeout(360_000);
  await page.goto("/?eyePilot=v2&eyeCompute=native");
  const report = await page.evaluate(async () => {
    const m = await import("/src/lib/tryon.ts");
    const photo = await (await fetch("/makeup/looks/no-makeup.webp")).blob();
    const prep = await m.preparePhoto(photo);
    const native = await m.paintLook(prep.plain, "electric-blue", "natural");
    const nativeApplied = m.gpu()?.lastNativeEye === true;
    const nativeSubmitMs = m.gpu()?.lastNativeEyeMs ?? -1;
    const source = prep.plain.photo;
    // Own a copy: the renderer reuses its GPU drawing canvas for every look.
    const a = native.getContext("2d")!.getImageData(0,0,native.width,native.height).data;
    history.replaceState({}, "", "/");
    const baseline = await m.paintLook(prep.plain, "electric-blue", "natural");
    const b = baseline.getContext("2d")!.getImageData(0,0,baseline.width,baseline.height).data;
    let changed=0, outside=0, border=0;
    const width=source.width,height=source.height,pts=prep.plain.points;
    const eyeIds=[33,133,263,362,159,386,70,107,300,336];
    const ex=eyeIds.map(i=>pts[i][0]), ey=eyeIds.map(i=>pts[i][1]);
    const minX=Math.min(...ex)-width*.06,maxX=Math.max(...ex)+width*.06;
    const minY=Math.min(...ey)-height*.05,maxY=Math.max(...ey)+height*.05;
    for(let i=0;i<width*height;i++){
      let different=false;
      for(let c=0;c<3;c++) if(Math.abs(a[i*4+c]-b[i*4+c])>2)different=true;
      if(!different)continue;
      changed++;
      const x=i%width,y=Math.floor(i/width);
      if(x<minX||x>maxX||y<minY||y>maxY)outside++;
      if(x<width*.08||x>width*.92||y<height*.08||y>height*.92)border++;
    }
    return {nativeApplied,nativeSubmitMs,changed,outside,border,width,height};
  });
  expect(report.nativeApplied).toBe(true);
  expect(report.nativeSubmitMs).toBeGreaterThanOrEqual(0);
  expect(report.changed).toBeGreaterThan(30);
  expect(report.outside).toBe(0);
  expect(report.border).toBe(0);
  expect(report.width).toBeGreaterThan(300);
  expect(report.height).toBeGreaterThan(300);
});
