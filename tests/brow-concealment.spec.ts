import { test, expect } from "playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("thin brow local skin reference: paired bright-face GPU test",async({page})=>{
  test.setTimeout(420_000);
  await page.goto("/?engine=v2");
  const b64=readFileSync(join(process.cwd(),"tests/fixtures/lit-cheek.jpg")).toString("base64");
  const rows=await page.evaluate(async b64=>{
    const m=await import("/src/lib/tryon.ts");
    const gl=await import("/src/lib/makeup-gl.ts");
    if(m.engine()!=="gpu")throw new Error("Actual GPU required");
    await m.downloadModels(["no-makeup"],()=>{});
    const photo=await createImageBitmap(await(await fetch("data:image/jpeg;base64,"+b64)).blob());
    const pixels=(c:HTMLCanvasElement)=>{
      const t=document.createElement("canvas");t.width=c.width;t.height=c.height;
      const g=t.getContext("2d")!;g.drawImage(c,0,0);return g.getImageData(0,0,t.width,t.height);
    };
    const rows=[];
    for(const light of [1,1.25]){
      const t=document.createElement("canvas");t.width=photo.width;t.height=photo.height;
      const g=t.getContext("2d")!;g.filter="brightness("+light+")";g.drawImage(photo,0,0);
      const blob=await new Promise<Blob>((resolve,reject)=>t.toBlob(b=>b?resolve(b):reject(Error("PNG failed")),"image/png"));
      const shot=(await m.preparePhoto(blob)).plain, bare=pixels(shot.photo),P=shot.points;
      const ew=gl.eyeWidth(P), bands=gl.browBands(P,shot.face);
      const brow={place:"thin",soft:.012,size:1,hex:"#4c3328",thick:.02};
      const render=async(place:string,pilot:boolean)=>{
        history.replaceState(null,"",pilot?"/?engine=v2&browBlockPilot=1":"/?engine=v2");
        return pixels(await m.paintMine(shot,{gain:{brows:1},brows:{...brow,place}}));
      };
      const a=await render("thin",false),b=await render("thin",true);
      const c=await render("natural",false),d=await render("natural",true);
      let changed=0,controlChanged=0,protectedChanged=0,maxDelta=0,unmodifiedChanged=0;
      const all=bands.flat();
      const xs=all.map(p=>p.b[0]),ys=all.map(p=>p.b[1]);
      const xmin=Math.min(...xs)-ew*.45,xmax=Math.max(...xs)+ew*.45,ymin=Math.min(...ys)-ew*.65,ymax=Math.max(...ys)+ew*.3;
      for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++){
        const i=4*(y*a.width+x);
        if([0,1,2].some(k=>c.data[i+k]!==d.data[i+k]))controlChanged++;
        const delta=Math.max(...[0,1,2].map(k=>Math.abs(a.data[i+k]-b.data[i+k])));
        if(!delta)continue;
        changed++;maxDelta=Math.max(maxDelta,delta);
        if(x<xmin||x>xmax||y<ymin||y>ymax)protectedChanged++;
        if([0,1,2].every(k=>a.data[i+k]===bare.data[i+k]))unmodifiedChanged++;
      }
      const sample=(im:ImageData,p:number[])=>{
        const x=Math.round(p[0]),y=Math.round(p[1]);
        if(x<0||x>=im.width||y<0||y>=im.height)throw Error("Invalid brow sample");
        const i=4*(y*im.width+x);return .2126*im.data[i]+.7152*im.data[i+1]+.0722*im.data[i+2];
      };
      let deficitBefore=0,deficitAfter=0,n=0;
      for(const side of bands)for(const p of side.slice(1,4)){
        const at=(h:number)=>[p.b[0]+p.n[0]*ew*h,p.b[1]+p.n[1]*ew*h];
        // Below the redrawn pencil centre, compare with nearby bare skin.
        const low=at(p.band[0]+.2*(p.band[1]-p.band[0]));
        const skin=at(p.band[0]-.17);
        const ref=sample(bare,skin);
        deficitBefore+=Math.max(0,ref-sample(a,low));
        deficitAfter+=Math.max(0,ref-sample(b,low));n++;
      }
      rows.push({light,changed,controlChanged,protectedChanged,unmodifiedChanged,maxDelta,deficitBefore:deficitBefore/n,deficitAfter:deficitAfter/n});
    }
    photo.close();return rows;
  },b64);
  console.log("BROW_CONCEALMENT_GPU_AB",JSON.stringify(rows));
  for(const row of rows){
    expect(row.controlChanged).toBe(0);
    expect(row.protectedChanged).toBe(0);
    expect(row.maxDelta).toBeLessThanOrEqual(20);
    expect(row.deficitAfter).toBeLessThanOrEqual(row.deficitBefore+.25);
  }
  // Zero changed pixels are an inert safety result only. Real-face and
  // artist acceptance is needed to establish residual hair reduction.
});
