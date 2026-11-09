import { test, expect, type Page } from "playwright/test";

/**
 * Render a real SVG illustration in Chromium and compare pixels of the nail
 * itself, not the fixed skin/background. Same "ivory" colorway throughout.
 * A file-hash check cannot catch duplicated / renamed vectors.
 */
const manicure = [
  ["velvet","مخمل مات"],["magnetic","چشم‌گربه‌ای"],
  ["jelly","ژلی شفاف"],["aura","هاله نور"],
  ["foil","ورق طلا"],["botanical","شاخه‌های ظریف"],
  ["geometry","ژئومتریک"],["celestial","کهکشان"],
  ["sculpture","موج سه‌بعدی"],["minimal","نقطه مینیمال"],
  ["bridal","عروس مرواریدی"],["seasonal","برگ پاییزی"],
  ["gradient","دودی آمبره"],["prism","پریزم کروم"],
  ["modern-french","فرنچ دوخط"],["watercolor","آبرنگ ابری"],
] as const;
const pedicure = [
  ["clean-gloss","پدیکور براق"],["skinny-french","پدیکور فرنچ میکرو"],
  ["metallic","پدیکور کروم"],["aura","پدیکور هاله‌ای"],
  ["jelly","پدیکور ژلی"],["glitter","پدیکور استارداست"],
  ["gold-leaf","پدیکور ورق طلا"],["botanical","پدیکور گیاهی"],
  ["minimal","پدیکور نقطه‌ای"],["cat-eye","پدیکور چشم‌گربه‌ای"],
  ["geometric","پدیکور هندسی"],["marble","پدیکور مرمری"],
] as const;

async function visit(page:Page) {
  await page.setViewportSize({width:390,height:850});
  await page.addInitScript(()=>localStorage.setItem("hananeh-atelier-v1",
    JSON.stringify({welcomed:true,theme:"light",bookings:[],favNails:[]})));
  await page.goto("/#/nails");
  await expect(page.getByRole("heading",{name:/هنر ناخن/})).toBeVisible();
}

async function pixelCrop(page:Page,kind:"manicure"|"pedicure") {
  return page.locator(".nail-card .nail-visual__fallback svg").evaluate(async(svg,which)=>{
    // The crop is defined in viewBox units. A detached <svg> with missing or
    // percentage dimensions otherwise rasterizes at a browser fallback size,
    // causing the sampled nail region to miss the design entirely.
    const [sourceWidth,sourceHeight]=which==="manicure" ? [290,255] : [312,262];
    const copy=svg.cloneNode(true) as SVGSVGElement;
    copy.setAttribute("xmlns","http://www.w3.org/2000/svg");
    copy.setAttribute("width",String(sourceWidth));
    copy.setAttribute("height",String(sourceHeight));
    const svgText=new XMLSerializer().serializeToString(copy);
    const img=new Image();
    img.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svgText);
    await img.decode();
    const canvas=document.createElement("canvas");
    canvas.width=96;canvas.height=96;
    const ctx=canvas.getContext("2d",{willReadFrequently:true});
    if(!ctx)throw new Error("Cannot allocate pixel-audit canvas");
    // 3rd fingernail or large toenail, excluding the shared background.
    const region=which==="manicure" ? [113,42,58,104] : [42,28,40,38];
    ctx.drawImage(img,...(region as [number,number,number,number]),0,0,96,96);
    const pixels=ctx.getImageData(0,0,96,96).data;
    const rgb:number[]=[];
    for(let i=0;i<pixels.length;i+=4)rgb.push(pixels[i],pixels[i+1],pixels[i+2]);
    return {rgb,motif:svg.getAttribute("data-nail-motif"),finish:svg.getAttribute("data-nail-finish")};
  },kind);
}

type Sample={rgb:number[];motif:string|null;finish:string|null};
function closestPair(samples:Record<string,Sample>) {
  const names=Object.keys(samples);
  let distance=1,pair=["",""];
  for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++){
    const a=samples[names[i]].rgb,b=samples[names[j]].rgb;
    expect(a).toHaveLength(96*96*3);
    expect(b).toHaveLength(96*96*3);
    let sum=0;
    for(let k=0;k<a.length;k++)sum+=Math.abs(a[k]-b[k]);
    const diff=sum/(a.length*255);
    if(diff<distance){distance=diff;pair=[names[i],names[j]];}
  }
  return {distance,pair};
}

test("16 ivory manicure techniques produce nonduplicate native-SVG raster art",async({page})=>{
  await visit(page);
  const samples:Record<string,Sample>={};
  for(const [id,title] of manicure) {
    await page.getByRole("searchbox",{name:"جست‌وجو در گالری ناخن"}).fill(title+" عاجی");
    const card=page.locator(".nail-card");
    await expect(card).toHaveCount(1);
    samples[id]=await pixelCrop(page,"manicure");
    expect(samples[id].motif,id).not.toBe("legacy");
  }
  expect(Object.keys(samples)).toHaveLength(16);
  expect(new Set(Object.values(samples).map(x=>x.motif)).size).toBe(16);
  const {distance,pair}=closestPair(samples);
  console.log("Closest manicure art pair:",pair.join(" vs "),"raster distance",distance.toFixed(5));
  expect(distance,`Visually indistinguishable manicure motifs: ${pair.join(" / ")}`).toBeGreaterThan(.008);
});

test("12 ivory pedicure techniques produce nonduplicate big-toe designs",async({page})=>{
  await visit(page);
  await page.getByRole("group",{name:"انتخاب گالری دست یا پا"})
    .getByRole("button",{name:"پدیکور · ۷۸ طرح"}).click();
  const samples:Record<string,Sample>={};
  for(const [id,title] of pedicure){
    await page.getByRole("searchbox",{name:"جست‌وجو در گالری ناخن"}).fill(title+" عاجی");
    await expect(page.locator(".nail-card")).toHaveCount(1);
    samples[id]=await pixelCrop(page,"pedicure");
    expect(samples[id].motif,id).not.toBe("legacy");
  }
  expect(Object.keys(samples)).toHaveLength(12);
  expect(new Set(Object.values(samples).map(x=>x.motif)).size).toBe(12);
  const {distance,pair}=closestPair(samples);
  console.log("Closest pedicure art pair:",pair.join(" vs "),"raster distance",distance.toFixed(5));
  expect(distance,`Visually indistinguishable pedicure motifs: ${pair.join(" / ")}`).toBeGreaterThan(.002);
});
