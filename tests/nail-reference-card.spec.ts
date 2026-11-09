import {test,expect,type Page} from "playwright/test";
import {readFile} from "node:fs/promises";

async function nailSheet(page:Page,query:string,title:string) {
  await page.setViewportSize({width:390,height:850});
  await page.addInitScript(()=>{
    localStorage.setItem("hananeh-atelier-v1",JSON.stringify({
      welcomed:true,theme:"light",bookings:[],favNails:[]
    }));
  });
  await page.goto("/#/nails");
  await page.getByRole("searchbox",{name:"جست‌وجو در گالری ناخن"}).fill(query);
  await page.getByRole("button",{name:"مشاهده طرح "+title}).click();
  return page.getByRole("dialog",{name:title});
}

async function assertDownloadedCard(download:import("playwright-core").Download,id:string){
  expect(download.suggestedFilename()).toBe("H-Beauty-"+id+".png");
  const file=await download.path();
  expect(file).not.toBeNull();
  const bytes=await readFile(file!);
  expect(bytes.length).toBeGreaterThan(20_000);
  expect(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))).toBe(true);
  expect(bytes.readUInt32BE(16)).toBe(1080);
  expect(bytes.readUInt32BE(20)).toBe(1350);
}

test("approved photographed nail saves branded PNG reference without another upload",async({page})=>{
  const detail=await nailSheet(page,"شیری ابریشمی","شیری ابریشمی");
  await expect(detail.locator(".nail-visual[data-media-source='ai-photo']")).toBeVisible();
  const [download]=await Promise.all([
    page.waitForEvent("download"),
    detail.getByRole("button",{name:"ذخیره تصویر طرح شیری ابریشمی"}).click()
  ]);
  await assertDownloadedCard(download,"nail-milky-silk");
  await expect(detail.getByRole("status").filter({hasText:"دانلود کارت تصویر این طرح آغاز شد."})).toBeVisible();
  await expect(detail.getByRole("button",{name:"درخواست اجرای همین طرح"})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth))
    .toBeLessThanOrEqual(1);
});

test("vector-only nail exports a real PNG without external photos or a network AI service",async({page})=>{
  await page.route("**/nails/photos/*.webp",route=>route.abort());
  const detail=await nailSheet(page,"فرنچ میکرو","فرنچ میکرو");
  await expect(detail.locator(".nail-visual[data-media-source='vector']")).toBeVisible();
  const [download]=await Promise.all([
    page.waitForEvent("download"),
    detail.getByRole("button",{name:"ذخیره تصویر طرح فرنچ میکرو"}).click()
  ]);
  await assertDownloadedCard(download,"nail-micro-french");
  await expect(detail.getByRole("status").filter({hasText:"دانلود کارت تصویر این طرح آغاز شد."})).toBeVisible();
  await expect(detail.getByRole("button",{name:"کپی لینک طرح فرنچ میکرو"})).toBeVisible();
});

test("reference card always names the requested design after switching colorways",async({page})=>{
  const detail=await nailSheet(page,"ژلی شفاف عاجی","ژلی شفاف عاجی");
  const [firstDownload]=await Promise.all([
    page.waitForEvent("download"),
    detail.getByRole("button",{name:"ذخیره تصویر طرح ژلی شفاف عاجی"}).click()
  ]);
  expect(firstDownload.suggestedFilename()).toContain("nail-atlas-jelly-ivory");
  await expect(detail.getByText("دانلود کارت تصویر این طرح آغاز شد.")).toBeVisible();
  await detail.getByRole("button",{name:"انتخاب رنگ ژلی شفاف یاقوتی"}).click();
  const changed=page.getByRole("dialog",{name:"ژلی شفاف یاقوتی"});
  await expect(changed).toBeVisible();
  await expect(changed.getByText("دانلود کارت تصویر این طرح آغاز شد.")).toHaveCount(0);
  const [download]=await Promise.all([
    page.waitForEvent("download"),
    changed.getByRole("button",{name:"ذخیره تصویر طرح ژلی شفاف یاقوتی"}).click()
  ]);
  expect(download.suggestedFilename()).toContain("nail-atlas-jelly-ruby");
  await expect(changed.getByRole("button",{name:"درخواست اجرای همین طرح"})).toBeVisible();
});
