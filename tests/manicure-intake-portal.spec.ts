import { test, expect } from "playwright/test";
import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import { readFileSync } from "node:fs";

const PAGE="/review/manicure-intake.html";
const MANIFEST="/review/manifest-146.json";
const ID="nail-atlas-aura-blush";
const original="fff72c6cd80dede315a2172657f0f7ab70d9dfe4f2f33092e1ca43ad1b879ddb";

async function createFixtureWebP(page: import("playwright/test").Page): Promise<Buffer> {
  const array=await page.evaluate(async()=>{
    const canvas=document.createElement("canvas");
    canvas.width=1600;canvas.height=1600;
    const c=canvas.getContext("2d");
    if(!c)throw new Error("canvas context missing");
    c.fillStyle="#f2e7dc";c.fillRect(0,0,1600,1600);
    c.fillStyle="#8e5982";c.fillRect(400,400,800,800);
    const blob=await new Promise<Blob>((resolve,reject)=>
      canvas.toBlob(x=>x?resolve(x):reject(Error("WebP encode failed")),"image/webp",.9));
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
  return Buffer.from(array);
}

function zipOneWebP(name:string,source:Buffer):Buffer {
  const path=Buffer.from(name,"utf8"), deflated=deflateRawSync(source);
  const local=Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(8,8);
  local.writeUInt32LE(deflated.length,18);local.writeUInt32LE(source.length,22);
  local.writeUInt16LE(path.length,26);
  const central=Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);
  central.writeUInt16LE(8,10);central.writeUInt32LE(deflated.length,20);
  central.writeUInt32LE(source.length,24);central.writeUInt16LE(path.length,28);
  central.writeUInt32LE(0,42);
  const off=local.length+path.length+deflated.length;
  const end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);
  end.writeUInt32LE(central.length+path.length,12);end.writeUInt32LE(off,16);
  return Buffer.concat([local,path,deflated,central,path,end]);
}

test("manicure QA portal displays all hosted original sources, RTL, and separate nonapproved statuses", async({page})=>{
  const outside:string[]=[];
  page.on("request",r=>{if(!r.url().includes("127.0.0.1:4173"))outside.push(r.url())});
  await page.setViewportSize({width:390,height:844});
  await page.goto(PAGE);
  await expect(page.locator("html")).toHaveAttribute("dir","rtl");
  await expect(page.locator(".tile")).toHaveCount(146);
  await expect(page.locator("#loaded")).toHaveText("0");
  await expect(page.locator(".preview img")).toHaveCount(146);
  await expect.poll(()=>page.locator(".tile").first().locator("img").evaluate(e=>(e as HTMLImageElement).naturalWidth)).toBe(1600);
  expect(outside).toEqual([]);
  await page.locator('[data-filter="REJECT_REGENERATE"]').click();
  await expect(page.locator(".tile")).toHaveCount(16);
  await page.locator('[data-filter="HOLD_EXACT_STYLE_REVIEW"]').click();
  await expect(page.locator(".tile")).toHaveCount(16);
  await page.locator('[data-filter="VISUAL_CANDIDATE_NOT_APPROVED"]').click();
  await expect(page.locator(".tile")).toHaveCount(28);
  await page.locator('[data-filter="NEEDS_EDITORIAL_REVIEW"]').click();
  await expect(page.locator(".tile")).toHaveCount(86);
  const size=await page.evaluate(()=>({doc:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth}));
  expect(size.doc).toBeLessThanOrEqual(size.viewport+1);
});

test("real WebP user-file import rejects false SHA and accepts matching original", async({page})=>{
  await page.goto(PAGE);
  const raw=await createFixtureWebP(page);
  await page.locator("#files").setInputFiles({name:ID+".webp",mimeType:"image/webp",buffer:raw});
  await expect(page.locator("#loaded")).toHaveText("0");
  await expect(page.locator("#alert")).toContainText("SHA-256");
  const hash=createHash("sha256").update(raw).digest("hex");
  await page.route("**/review/manifest-146.json*",async route=>{
    const response=await route.fetch();
    const source=await response.text();
    expect(source).toContain(original);
    await route.fulfill({contentType:"application/json",body:source.replace(original,hash)});
  });
  await page.reload();
  await page.locator("#files").setInputFiles({name:ID+".webp",mimeType:"image/webp",buffer:raw});
  await expect(page.locator("#loaded")).toHaveText("1");
  await page.locator(".tile").first().locator(".inspect").click();
  await expect(page.locator("dialog")).toHaveJSProperty("open",true);
  await expect(page.locator("#modalMeta")).toContainText("NOT APPROVED");
});

test("real deflated ZIP archive imports on device without publishing unapproved photos", async({page})=>{
  await page.goto(PAGE);
  const raw=await createFixtureWebP(page);
  const hash=createHash("sha256").update(raw).digest("hex");
  await page.route("**/review/manifest-146.json*",async route=>{
    const response=await route.fetch();
    await route.fulfill({contentType:"application/json",body:(await response.text()).replace(original,hash)});
  });
  await page.reload();
  // The manifest bootstraps asynchronously; make sure the SHA-locked specs
  // are initialized before delivering a synthetic ZIP in parallel CI.
  await expect(page.locator(".tile")).toHaveCount(146);
  await expect.poll(async () => page.evaluate((id) => {
    const row=(window as typeof window & {HBEAUTY_MANIFEST?:Array<{id:string;sha:string}>})
      .HBEAUTY_MANIFEST?.find(entry=>entry.id===id);
    return row?.sha;
  }, ID)).toBe(hash);
  const zipped=zipOneWebP(ID+".webp",raw);
  await page.locator("#files").setInputFiles({name:"manicure-test.zip",mimeType:"application/zip",buffer:zipped});
  await expect(page.locator("#loaded")).toHaveText("1",{timeout:15000});
  await expect(page.locator("#alert")).toContainText("هیچ خطای انتقالی یافت نشد");
});

test("keyboard-only reviewer can access the optional native ZIP picker", async({page})=>{
  await page.goto(PAGE);
  await expect(page.locator(".tile")).toHaveCount(146);
  const details=page.locator(".local-import");
  const summary=details.locator("summary");
  await summary.focus();
  await expect(summary).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(details).toHaveAttribute("open","");
  const input=page.locator("#files");
  await expect(input).toBeVisible();
  await input.focus();
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute("multiple","");
});


test("all 146 SHA-locked hosted originals are distinct and explicitly not approved",async({page,request})=>{
 const response=await request.get(MANIFEST);
 expect(response.ok()).toBeTruthy();
 const manifest=await response.json();
 expect(manifest.schema).toBe(2);
 expect(manifest.count).toBe(146);
 expect(manifest.approval).toBe("NOT_GRANTED");
 expect(manifest.files).toHaveLength(146);
 const ids=manifest.files.map((x:{id:string})=>x.id);
 const hashes=manifest.files.map((x:{sha:string})=>x.sha);
 expect(new Set(ids).size).toBe(146);
 expect(new Set(hashes).size).toBe(146);
 expect(manifest.files.filter((x:{status:string})=>x.status==="NEEDS_EDITORIAL_REVIEW")).toHaveLength(86);
 expect(manifest.files.filter((x:{status:string})=>x.status==="REJECT_REGENERATE")).toHaveLength(16);
 await page.goto(PAGE);
 await expect(page.locator(".tile")).toHaveCount(146);
 await page.locator('[data-filter="NEEDS_EDITORIAL_REVIEW"]').click();
 await expect(page.locator(".tile")).toHaveCount(86);
});


test("all 146 review photos use their exact Persian names from the source catalog",async({page,request})=>{
  const response=await request.get(MANIFEST);
  expect(response.ok()).toBeTruthy();
  const manifest=await response.json();
  const queue=JSON.parse(readFileSync("docs/HBEAUTY_MANICURE_162_QUEUE.json","utf8"));
  const pending=queue.batches.flatMap((b:{styles:any[]})=>b.styles)
    .filter((s:{qa_status:string})=>s.qa_status==="NOT_GENERATED");
  expect(pending).toHaveLength(146);
  const names=new Map(pending.map((s:{id:string,title:string,en:string})=>[s.id,s]));
  expect(names.size).toBe(146);
  expect(manifest.files).toHaveLength(146);
  const titles=new Set<string>();
  for(const file of manifest.files){
    const original=names.get(file.id) as {title:string,en:string}|undefined;
    expect(original,"unknown style "+file.id).toBeDefined();
    expect(file.title,"wrong Persian name for "+file.id).toBe(original!.title);
    expect(file.en,"wrong English name for "+file.id).toBe(original!.en);
    expect(file.title).toMatch(/[\u0600-\u06FF]/u);
    titles.add(file.title);
  }
  expect(titles.size).toBe(146);
  await page.setViewportSize({width:390,height:844});
  await page.goto(PAGE);
  await expect(page.locator(".style-title-fa")).toHaveCount(146);
  await page.locator(".search").fill("باغ زیتونی");
  await expect(page.locator(".tile")).toHaveCount(1);
  await expect(page.locator(".tile .style-title-fa")).toHaveText("باغ زیتونی");
  await expect(page.locator(".tile .cardbody strong")).toHaveText("nail-sage-garden");
  await page.locator(".tile .inspect").click();
  await expect(page.locator("#modalFaName")).toHaveText("باغ زیتونی");
  await expect(page.locator("#modalId")).toHaveText("nail-sage-garden");
});


test("stale title-less cached manifest restores all 146 Persian names without erasing flags",async({page})=>{
  await page.route("**/review/manifest-146.json*",async route=>{
    const original=await route.fetch();
    const old=await original.json();
    expect(old.files).toHaveLength(146);
    for(const item of old.files){delete item.title;delete item.en;}
    await route.fulfill({contentType:"application/json",body:JSON.stringify(old)});
  });
  await page.goto(PAGE);
  await expect(page.locator(".tile")).toHaveCount(146);
  await expect(page.locator(".style-title-fa")).toHaveCount(146);
  await page.locator(".search").fill("باغ زیتونی");
  await expect(page.locator(".tile")).toHaveCount(1);
  await expect(page.locator(".tile .style-title-fa")).toHaveText("باغ زیتونی");
  await page.locator(".tile .review-btn.hold").click();
  await expect(page.locator("#flaggedTop")).toHaveText("1");
  await page.reload();
  await expect(page.locator(".style-title-fa")).toHaveCount(146);
  await expect(page.locator("#flaggedTop")).toHaveText("1");
  await page.locator('[data-filter="__flags__"]').click();
  await expect(page.locator(".tile")).toHaveCount(1);
});

test("legacy manifest fallback rejects mismatched source hash instead of attaching a wrong name",async({page})=>{
  let changed=false;
  await page.route("**/review/manifest-146.json*",async route=>{
    const original=await route.fetch();
    const old=await original.json();
    for(const item of old.files){delete item.title;delete item.en;}
    old.files[0].sha="b".repeat(64);
    changed=true;
    await route.fulfill({contentType:"application/json",body:JSON.stringify(old)});
  });
  await page.goto(PAGE);
  await expect.poll(()=>changed).toBe(true);
  await expect(page.locator("#alert")).toContainText("Photo-to-title mapping");
  await expect(page.locator(".tile")).toHaveCount(0);
});
