import {test,expect,type Page} from "playwright/test";
import {readFile} from "node:fs/promises";

async function openStyle(page:Page,query:string,title:string){
  await page.setViewportSize({width:390,height:820});
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

test("native share passes an actual local photo-reference PNG with honest title",async({page})=>{
  await page.addInitScript(()=>{
    Object.defineProperty(navigator,"canShare",{configurable:true,value:(data:ShareData)=>Boolean(data.files?.length)});
    Object.defineProperty(navigator,"share",{configurable:true,value:async(data:ShareData)=>{
      const file=data.files?.[0];
      if(!file)throw Error("No attached PNG");
      (window as Window&{__hbeautyShare?:unknown}).__hbeautyShare={
        name:file.name,type:file.type,size:file.size,
        title:data.title,text:data.text,
        activationAtShare:navigator.userActivation?.isActive??null,
        header:Array.from(new Uint8Array(await file.slice(0,8).arrayBuffer()))
      };
    }});
  });
  const detail=await openStyle(page,"شیری ابریشمی","شیری ابریشمی");
  await expect(detail.locator(".nail-visual[data-media-source='ai-photo']")).toBeVisible();
  await detail.getByRole("button",{name:"اشتراک تصویر طرح شیری ابریشمی"}).click();
  await expect(detail.getByRole("status").filter({hasText:"تصویر طرح به برنامهٔ انتخابی تحویل داده شد."})).toBeVisible();
  const share=await page.evaluate(()=>(window as Window&{__hbeautyShare?:unknown}).__hbeautyShare) as {
    name:string;type:string;size:number;title:string;text:string;header:number[];activationAtShare:boolean|null
  };
  expect(share.name).toBe("H-Beauty-nail-milky-silk.png");
  expect(share.type).toBe("image/png");
  expect(share.size).toBeGreaterThan(20_000);
  expect(share.header).toEqual([137,80,78,71,13,10,26,10]);
  expect(share.text).toContain("عکس اجرای واقعی سالن");
  // A real phone's Web Share API requires activation from this exact tap.
  expect(share.activationAtShare).toBe(true);
  await expect(detail.getByRole("button",{name:"درخواست اجرای همین طرح"})).toBeVisible();
});

test("when native file share is unavailable, export starts an offline PNG download",async({page})=>{
  await page.addInitScript(()=>{
    Object.defineProperty(navigator,"share",{configurable:true,value:undefined});
    Object.defineProperty(navigator,"canShare",{configurable:true,value:undefined});
  });
  await page.route("**/nails/photos/*.webp",route=>route.abort());
  const detail=await openStyle(page,"فرنچ میکرو","فرنچ میکرو");
  const [download]=await Promise.all([
    page.waitForEvent("download"),
    detail.getByRole("button",{name:"اشتراک تصویر طرح فرنچ میکرو"}).click()
  ]);
  expect(download.suggestedFilename()).toBe("H-Beauty-nail-micro-french.png");
  const image=await readFile((await download.path())!);
  expect(image.subarray(0,8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
  expect(image.readUInt32BE(16)).toBe(1080);
  expect(image.readUInt32BE(20)).toBe(1350);
  await expect(detail.getByRole("status").filter({hasText:"اشتراک مستقیم در دسترس نبود؛ دانلود تصویر آغاز شد."})).toBeVisible();
  await expect(detail.getByRole("button",{name:"درخواست اجرای همین طرح"})).toBeVisible();
});

test("cancelling a native mobile share does not download an unexpected image",async({page})=>{
  await page.addInitScript(()=>{
    Object.defineProperty(navigator,"canShare",{configurable:true,value:()=>true});
    Object.defineProperty(navigator,"share",{configurable:true,value:async()=>{
      throw new DOMException("User cancelled","AbortError");
    }});
  });
  const detail=await openStyle(page,"شیری ابریشمی","شیری ابریشمی");
  let downloads=0;
  page.on("download",()=>downloads++);
  await detail.getByRole("button",{name:"اشتراک تصویر طرح شیری ابریشمی"}).click();
  await expect(detail.getByRole("button",{name:"اشتراک تصویر طرح شیری ابریشمی"})).toBeEnabled();
  await expect(detail.getByText("اشتراک مستقیم در دسترس نبود؛ دانلود تصویر آغاز شد.")).toHaveCount(0);
  await expect(detail.getByText("تصویر طرح به برنامهٔ انتخابی تحویل داده شد.")).toHaveCount(0);
  expect(downloads).toBe(0);
});


test("share does not encode PNG after click and therefore preserves user activation",async({page})=>{
  await page.addInitScript(()=>{
    Object.defineProperty(navigator,"canShare",{configurable:true,value:(data:ShareData)=>Boolean(data.files?.length)});
    Object.defineProperty(navigator,"share",{configurable:true,value:async(data:ShareData)=>{
      if(!data.files?.[0])throw Error("Missing prebuilt PNG");
      (window as Window&{__shareActivation?:boolean}).__shareActivation=
        navigator.userActivation.isActive;
    }});
  });
  const detail=await openStyle(page,"شیری ابریشمی","شیری ابریشمی");
  const button=detail.getByRole("button",{name:"اشتراک تصویر طرح شیری ابریشمی"});
  await expect(button).toBeEnabled();
  // The card is ready BEFORE the user gesture. Any toBlob during the click
  // would require an async step which can lose transient activation.
  await page.evaluate(()=>{
    HTMLCanvasElement.prototype.toBlob=()=>{throw Error("Canvas encoded after share tap");};
  });
  await button.click();
  await expect(detail.getByText("تصویر طرح به برنامهٔ انتخابی تحویل داده شد.")).toBeVisible();
  expect(await page.evaluate(()=>(window as Window&{__shareActivation?:boolean}).__shareActivation)).toBe(true);
});
