import type { NailStyle } from "@/data/nail-styles";

/**
 * Export a consultation card entirely on-device from the already rendered
 * NailVisual. The 1080x1350 card is a graphic layout, NOT a claim that the
 * embedded 600px reference photograph has gained optical detail.
 *
 * Only a fully loaded, explicitly approved same-origin image is used;
 * otherwise render the design's local vector illustration. Never make a
 * new network request, send user data, or claim the image is salon work.
 */

type SavedSource = "ai-photo" | "vector";

function imageWithin(ctx: CanvasRenderingContext2D, media: CanvasImageSource,
  nativeWidth: number, nativeHeight: number, x: number, y: number,
  width: number, height: number) {
  if(nativeWidth<=0||nativeHeight<=0)throw Error("Image has no intrinsic dimensions");
  const scale=Math.min(width/nativeWidth,height/nativeHeight);
  const dw=nativeWidth*scale,dh=nativeHeight*scale;
  ctx.drawImage(media,x+(width-dw)/2,y+(height-dh)/2,dw,dh);
}

function paintCard(ctx:CanvasRenderingContext2D,style:NailStyle,source:SavedSource) {
  const w=1080,h=1350;
  ctx.fillStyle="#F5EFE9";
  ctx.fillRect(0,0,w,h);
  const background=ctx.createLinearGradient(0,0,1080,1350);
  background.addColorStop(0,"#FAF3EE");
  background.addColorStop(1,"#E9D8D9");
  ctx.fillStyle=background;
  ctx.fillRect(0,0,w,h);
  ctx.fillStyle="#FFF9F5";
  ctx.fillRect(48,152,984,930);
  ctx.fillStyle="#4A3440";
  ctx.textAlign="left";
  ctx.direction="ltr";
  ctx.font="bold 36px Georgia, serif";
  ctx.fillText("HANANEH BEAUTY",62,80);
  ctx.fillStyle="#8D6479";
  ctx.font="24px Georgia, serif";
  ctx.fillText("NAIL ATELIER / DESIGN REFERENCE",63,119);
  ctx.fillStyle="#4A3440";
  ctx.textAlign="right";
  ctx.direction="rtl";
  ctx.font="600 50px Estedad, Tahoma, sans-serif";
  ctx.fillText(style.title,1014,1157,935);
  ctx.fillStyle="#7C6070";
  ctx.font="25px Georgia, serif";
  ctx.textAlign="left";
  ctx.direction="ltr";
  ctx.fillText(style.en,62,1210,880);
  ctx.font="20px Arial, sans-serif";
  ctx.fillText(style.id,62,1253,880);
  ctx.fillStyle="#6D5361";
  ctx.font="25px Estedad, Tahoma, sans-serif";
  ctx.textAlign="right";
  ctx.direction="rtl";
  ctx.fillText(source==="ai-photo"
    ? "عکس الهام‌بخش ساخته‌شده با هوش مصنوعی"
    : "تصویرسازی برداری برای نمایش رنگ و فرم",1014,1270,920);
  ctx.fillStyle="#8D6479";
  ctx.font="20px Estedad, Tahoma, sans-serif";
  ctx.fillText("نمونهٔ الهام‌بخش است؛ عکس اجرای واقعی سالن نیست.",1014,1315,920);
}

function renderSVG(ctx:CanvasRenderingContext2D,svg:SVGSVGElement):Promise<void> {
  return new Promise((resolve,reject)=>{
    const clone=svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns","http://www.w3.org/2000/svg");
    const box=svg.viewBox.baseVal;
    const width=box.width||290,height=box.height||255;
    clone.setAttribute("width",String(width));
    clone.setAttribute("height",String(height));
    const blob=new Blob([new XMLSerializer().serializeToString(clone)],{type:"image/svg+xml;charset=utf-8"});
    const src=URL.createObjectURL(blob);
    const image=new Image();
    image.onload=()=>{
      try {
        imageWithin(ctx,image,image.naturalWidth,image.naturalHeight,68,172,944,885);
        resolve();
      }catch(error){reject(error);}
      finally{URL.revokeObjectURL(src);}
    };
    image.onerror=()=>{URL.revokeObjectURL(src);reject(new Error("SVG preview could not be decoded"));};
    image.src=src;
  });
}

export async function createNailReferenceCard(style:NailStyle,visual:HTMLElement):
  Promise<{blob:Blob;source:SavedSource}> {
  const canvas=document.createElement("canvas");
  canvas.width=1080;canvas.height=1350;
  const ctx=canvas.getContext("2d");
  if(!ctx)throw Error("Canvas export is not supported in this browser");
  const photo=visual.querySelector<HTMLImageElement>(".nail-visual__photo[data-ready]");
  const usablePhoto=photo?.complete&&photo.naturalWidth>0&&photo.naturalHeight>0
    &&photo.currentSrc.startsWith(window.location.origin+"/nails/photos/");
  let source:SavedSource="vector";
  // Photo references are bundled with the app; no request to any remote AI.
  // Fall back gracefully if a photo disappears while the sheet is open.
  if(usablePhoto&&photo) {
    source="ai-photo";
  }
  paintCard(ctx,style,source);
  if(source==="ai-photo"&&photo){
    imageWithin(ctx,photo,photo.naturalWidth,photo.naturalHeight,68,172,944,885);
  }else{
    const svg=visual.querySelector<SVGSVGElement>(".nail-visual__fallback svg");
    if(!svg)throw Error("Local nail illustration is unavailable");
    await renderSVG(ctx,svg);
  }
  const blob=await new Promise<Blob>((resolve,reject)=>{
    canvas.toBlob(result=>result?resolve(result):reject(new Error("PNG export failed")),"image/png");
  });
  return {blob,source};
}

/** Start an actual browser download; this cannot prove file storage succeeded. */
function downloadReferenceBlob(style:NailStyle,blob:Blob):void {
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;
  link.download="H-Beauty-"+style.id+".png";
  link.style.display="none";
  document.body.appendChild(link);
  try{link.click();}
  finally{
    link.remove();
    // Avoid revoking before mobile browsers have processed the download.
    setTimeout(()=>URL.revokeObjectURL(url),30_000);
  }
}

export async function saveNailReferenceCard(style:NailStyle,visual:HTMLElement):
  Promise<SavedSource> {
  const {blob,source}=await createNailReferenceCard(style,visual);
  downloadReferenceBlob(style,blob);
  return source;
}

/**
 * Mobile Web Share: send an already-created local PNG to a chosen installed app.
 * When file sharing is unavailable/denied, initiate the existing PNG download.
 * A user-cancelled share must not unexpectedly create a local download.
 * Neither path posts a customer image to an H-Beauty server.
 */
export function sharePreparedNailReferenceCard(
  style:NailStyle,
  prepared:{blob:Blob;source:SavedSource}
):Promise<{status:"shared"|"downloaded"|"cancelled";source:SavedSource}> {
  // CRITICAL: this function must be invoked directly by the button's click
  // handler. No canvas rendering, blob encoding or await may precede share().
  // Mobile browsers require transient user activation to open their share UI.
  const {blob,source}=prepared;
  const filename="H-Beauty-"+style.id+".png";
  if(typeof File!=="undefined" &&
     typeof navigator.share==="function" &&
     typeof navigator.canShare==="function") {
    const file=new File([blob],filename,{type:"image/png"});
    let eligible=false;
    try{eligible=navigator.canShare({files:[file]});}catch{eligible=false;}
    if(eligible) {
      try{
        const sharePromise=navigator.share({
          files:[file],
          title:"Hananeh Beauty — "+style.en,
          text:"مرجع طرح ناخن "+style.title+" — تصویر الهام‌بخش، نه عکس اجرای واقعی سالن",
        });
        // Navigator.share was invoked synchronously with the original click.
        // Only await the *result* after the browser accepted that call.
        return sharePromise.then(()=>({status:"shared" as const,source}))
          .catch((error:unknown)=>{
            if(error instanceof DOMException && error.name==="AbortError")
              return {status:"cancelled" as const,source};
            // Some share targets reject files after opening the share sheet.
            // Offer the same local PNG via the existing download mechanism.
            downloadReferenceBlob(style,blob);
            return {status:"downloaded" as const,source};
          });
      }catch(error){
        if(error instanceof DOMException && error.name==="AbortError")
          return Promise.resolve({status:"cancelled" as const,source});
        // A platform may deny file sharing despite canShare() returning true.
        // Fall back to a local download, never to server-side uploading.
      }
    }
  }
  downloadReferenceBlob(style,blob);
  return Promise.resolve({status:"downloaded",source});
}
