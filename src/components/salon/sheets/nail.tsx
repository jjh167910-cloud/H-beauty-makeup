import { useCallback, useEffect, useRef, useState } from "react";
import type { NailStyle } from "@/data/nail-styles";
import { nailStyleShareUrl } from "@/data/nail-links";
import { NAIL_FINISHES, NAIL_SHAPES, NAIL_STYLES } from "@/data/nail-styles";
import { NAIL_ATLAS_FAMILIES } from "@/data/nail-expansion";
import { serviceById, formatMinutes } from "@/data/salon";
import { useSalon } from "@/lib/salon-store";
import { Icon } from "../icons";
import { NailVisual } from "../nail-visual";
import { createNailReferenceCard, saveNailReferenceCard, sharePreparedNailReferenceCard } from "@/lib/nail-reference-card";
import { Button, Sheet, haptic, useSalonActions } from "../ui";

export function NailSheet({ open, style, onClose }: { open: boolean; style: NailStyle; onClose: () => void }) {
  const { openBooking, openSheet } = useSalonActions();
  const [shareStatus, setShareStatus] = useState<"copied"|"manual"|null>(null);
  const [manualLink,setManualLink] = useState("");
  const imageRoot=useRef<HTMLDivElement>(null);
  // Drawer.Portal mounts after the Sheet's initial passive effects. A callback
  // ref makes mounting the actual image element an explicit effect dependency.
  const [mountedImageRoot,setMountedImageRoot]=useState<HTMLDivElement|null>(null);
  const attachImageRoot=useCallback((node:HTMLDivElement|null)=>{
    imageRoot.current=node;
    setMountedImageRoot(node);
  },[]);
  const [imageSave,setImageSave]=useState<{id:string;status:"idle"|"saving"|"saved"|"error"}>({id:style.id,status:"idle"});
  const saveStatus=imageSave.id===style.id?imageSave.status:"idle";
  const [imageShare,setImageShare]=useState<{id:string;status:"idle"|"sharing"|"shared"|"downloaded"|"cancelled"|"error"}>({id:style.id,status:"idle"});
  const shareImageStatus=imageShare.id===style.id?imageShare.status:"idle";
  // Build the PNG before the tap. navigator.share() must run synchronously
  // inside that tap; encoding a canvas after tapping may lose activation.
  const [preparedImage,setPreparedImage]=useState<{
    id:string;blob:Blob;source:"ai-photo"|"vector"
  }|null>(null);
  const [prepareFailed,setPrepareFailed]=useState<string|null>(null);
  const readyToShare=preparedImage?.id===style.id;
  useEffect(()=>{
    if(!open)return;
    const root=mountedImageRoot;
    if(!root)return;
    let disposed=false,generation=0;
    setPreparedImage(null);
    setPrepareFailed(null);
    const prepare=()=>{
      if(disposed||!root.isConnected)return;
      // Do not silently export an SVG while an approved photograph is
      // still loading. An image error removes it and enables vector fallback.
      if(root.querySelector(".nail-visual__photo:not([data-ready])"))return;
      const sequence=++generation;
      void createNailReferenceCard(style,root).then(card=>{
        if(!disposed&&sequence===generation) {
          setPreparedImage({id:style.id,...card});
          setPrepareFailed(null);
        }
      }).catch(()=>{
        if(!disposed&&sequence===generation)
          setPrepareFailed(style.id);
      });
    };
    const imageChanged=()=>{requestAnimationFrame(prepare);};
    root.addEventListener("load",imageChanged,true);
    root.addEventListener("error",imageChanged,true);
    // React applies data-ready *after* img.onload. A single animation frame
    // can still see the not-ready DOM, then never retry. Observe the actual
    // committed image state (also handles an offline fallback removing <img>).
    const observer=new MutationObserver(imageChanged);
    observer.observe(root,{
      attributes:true,
      attributeFilter:["data-ready","data-media-source","src"],
      childList:true,
      subtree:true,
    });
    const animation=requestAnimationFrame(prepare);
    return ()=>{
      disposed=true;generation++;
      cancelAnimationFrame(animation);
      observer.disconnect();
      root.removeEventListener("load",imageChanged,true);
      root.removeEventListener("error",imageChanged,true);
    };
  },[open,style.id,mountedImageRoot]);
  const shareImage=()=>{
    if(!preparedImage||preparedImage.id!==style.id)return;
    setImageShare({id:style.id,status:"sharing"});
    // Do not await anything before invoking this: the native share sheet
    // is gated by browser transient activation on the original button tap.
    void sharePreparedNailReferenceCard(style,preparedImage).then(result=>{
      setImageShare({id:style.id,status:result.status});
    }).catch(()=>{
      setImageShare({id:style.id,status:"error"});
    });
  };
  const saveImage=async()=>{
    if(!imageRoot.current)return;
    setImageSave({id:style.id,status:"saving"});
    try{
      await saveNailReferenceCard(style,imageRoot.current);
      setImageSave({id:style.id,status:"saved"});
    }catch{
      setImageSave({id:style.id,status:"error"});
    }
  };
  // The inspector is local to the currently selected design; changing
  // variants cannot inherit a stale crop/zoom position from another style.
  const [inspection,setInspection] = useState<{id:string;level:0|1|2}>({id:style.id,level:0});
  const inspectLevel=inspection.id===style.id ? inspection.level : 0;
  const nextInspection=()=>{
    haptic();
    setInspection({id:style.id,level:inspectLevel===2?0:(inspectLevel+1) as 0|1|2});
  };
  const inspectionLabel=inspectLevel===0 ? "نمایش تمام تصویر بدون برش"
    : inspectLevel===1 ? "بزرگ‌نمایی ۲ برابر و جابه‌جایی تصویر"
    : "بازگشت به پیش‌نمایش معمول";
  const share = async () => {
    const url = nailStyleShareUrl(style.id, window.location.href);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setShareStatus("copied");
    } catch {
      setManualLink(url);
      setShareStatus("manual");
    }
  };
  const favorites = useSalon((state) => state.favNails);
  const toggle = useSalon((state) => state.toggleFavNail);
  const saved = favorites.includes(style.id);
  const service = serviceById.get(style.serviceId);
  const finish = NAIL_FINISHES.find((entry) => entry.key === style.finish)?.title ?? style.finish;
  const shape = NAIL_SHAPES.find((entry) => entry.key === style.shape)?.title ?? style.shape;
  const family = NAIL_ATLAS_FAMILIES[style.kind ?? "manicure"].find(entry=>style.id.startsWith(entry.prefix));
  const familyVariants = family
    ? NAIL_STYLES.filter(item=>item.id.startsWith(family.prefix))
    : [];
  // A shade-only action must never silently change a saved design's shape
  // or length. Older catalog references had independently varied metadata,
  // so display those as explicitly different variants instead.
  const colorways = familyVariants.filter(item=>
    item.shape===style.shape && item.length===style.length);
  const otherVariants = familyVariants.filter(item=>
    item.shape!==style.shape || item.length!==style.length);
  const shapeLabel=(candidate:NailStyle)=>
    NAIL_SHAPES.find(item=>item.key===candidate.shape)?.title ?? candidate.shape;
  const lengthLabel=(candidate:NailStyle)=>
    candidate.length==="short"?"کوتاه":candidate.length==="medium"?"متوسط":"بلند";

  return (
    <Sheet open={open} onClose={onClose} title={style.title}>
      <article className="nail-detail">
        <div ref={attachImageRoot} id="nail-detail-image" className={`nail-detail__visual${inspectLevel>0 ? " nail-detail__visual--full" : ""}${inspectLevel===2 ? " nail-detail__visual--zoom" : ""}`}
          data-inspection-level={inspectLevel}>
          <NailVisual style={style} priority />
        </div>
        <div className="nail-detail__inspect-actions">
          <button type="button" className="nail-detail__inspect-button"
            aria-controls="nail-detail-image" aria-label={inspectionLabel}
            onClick={nextInspection}>{inspectionLabel}</button>
          <span role="status" aria-live="polite">{inspectLevel===2
            ? "برای دیدن جزئیات، تصویر را با لمس یا اسکرول جابه‌جا کنید."
            : inspectLevel===1 ? "نمایش کامل طرح، بدون بریدن لبه‌های تصویر." : "نمایش پیش‌نمایش طرح"}</span>
        </div>
        <div className="nail-detail__source" aria-live="polite">
          <span className="nail-detail__source--photo">مرجع عکاسی الهام‌بخش؛ ساخته‌شده با هوش مصنوعی</span>
          <span className="nail-detail__source--illustration">پیش‌نمایش برداری رنگ و فرم ناخن</span>
        </div>
        <small className="nail-detail__en" lang="en">{style.en.toUpperCase()}</small>
        <h3>{style.title}</h3>
        <p>{style.description}</p>
        <div className="nail-detail__tags">
          <span>جلوه: {finish}</span>
          <span>فرم: {shape}</span>
          <span>طول: {style.length === "short" ? "کوتاه" : style.length === "medium" ? "متوسط" : "بلند"}</span>
        </div>
        {family && familyVariants.length ? (
          <section className="nail-detail__colorways" aria-label="رنگ‌بندی و فرم‌های همین مجموعه">
            <div className="nail-detail__colorways-head">
              <strong>رنگ‌بندی با فرم و طول یکسان</strong>
              <span>{colorways.length.toLocaleString("fa-IR")} رنگ</span>
            </div>
            <div className="nail-detail__swatches" role="group" aria-label="انتخاب رنگ‌بندی">
              {colorways.map(option=>(
                <button
                  key={option.id}
                  type="button"
                  aria-label={`انتخاب رنگ ${option.title}`}
                  aria-pressed={style.id===option.id}
                  title={option.title}
                  className="nail-detail__swatch"
                  onClick={()=>{ if(option.id!==style.id){haptic();openSheet({kind:"nail",id:option.id});} }}
                >
                  <span style={{background:`linear-gradient(135deg,${option.base} 52%,${option.accent})`}} />
                </button>
              ))}
            </div>
            {otherVariants.length ? (
              <div className="nail-detail__alternative-forms">
                <strong>رنگ‌ها با فرم یا طول متفاوت</strong>
                <p>انتخاب‌های زیر ممکن است علاوه بر رنگ، فرم یا طول ناخن را نیز تغییر دهند.</p>
                <div className="nail-detail__alternative-list" role="group" aria-label="انتخاب مدل با فرم یا طول متفاوت">
                  {otherVariants.map(option=>(
                    <button key={option.id} type="button"
                      aria-label={`انتخاب مدل ${option.title} با فرم ${shapeLabel(option)} و طول ${lengthLabel(option)}`}
                      title={option.title}
                      onClick={()=>{haptic();openSheet({kind:"nail",id:option.id});}}>
                      <span className="nail-detail__alternative-dot"
                        style={{background:`linear-gradient(135deg,${option.base},${option.accent})`}}/>
                      <span>{option.title}</span>
                      <small>{shapeLabel(option)} · {lengthLabel(option)}</small>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}
        <p className="nail-detail__note">این طرح نمونهٔ الهام‌بخش ساخته‌شده با هوش مصنوعی یا تصویرسازی برداری است و عکس اجرای واقعی سالن نیست. انتخاب مواد، قیمت و زمان اجرا پس از مشاوره تعیین می‌شوند.</p>
        <div className="nail-detail__actions">
          <Button variant="gold" icon="book" onClick={() => {
            haptic();
            openBooking({ service: style.serviceId, nailStyleId: style.id });
          }}>درخواست اجرای همین طرح</Button>
          <button type="button" className="nail-card__favorite"
            aria-label={saved ? "حذف از علاقه‌مندی‌ها" : "ذخیره در علاقه‌مندی‌ها"}
            aria-pressed={saved} onClick={() => { haptic(); toggle(style.id); }}>
            <Icon name="heart" size={22} weight={saved ? "fill" : "light"} />
          </button>
        </div>
        <div className="nail-detail__share">
          <button type="button" className="nail-detail__share-button"
            onClick={saveImage} disabled={saveStatus==="saving"}
            aria-label={`ذخیره تصویر طرح ${style.title}`}>
            <Icon name="download" size={19}/>
            <span>{saveStatus==="saving" ? "در حال آماده‌سازی تصویر…" : "ذخیره تصویر طرح برای مشاوره"}</span>
          </button>
          {saveStatus==="saved" ? <p role="status">دانلود کارت تصویر این طرح آغاز شد.</p> : null}
          {saveStatus==="error" ? <p role="alert">ذخیره تصویر ممکن نشد؛ همچنان می‌توانید لینک طرح را به اشتراک بگذارید.</p> : null}
          <button type="button" className="nail-detail__share-button"
            onClick={shareImage} disabled={shareImageStatus==="sharing" || !readyToShare}
            aria-label={`اشتراک تصویر طرح ${style.title}`}>
            <Icon name="share" size={19}/>
            <span>{!readyToShare?"در حال آماده‌سازی کارت تصویر…" : shareImageStatus==="sharing"?"در حال اشتراک‌گذاری…" : "اشتراک تصویر با برنامه‌های گوشی"}</span>
          </button>
          {shareImageStatus==="shared"?<p role="status">تصویر طرح به برنامهٔ انتخابی تحویل داده شد.</p>:null}
          {shareImageStatus==="downloaded"?<p role="status">اشتراک مستقیم در دسترس نبود؛ دانلود تصویر آغاز شد.</p>:null}
          {shareImageStatus==="error"?<p role="alert">اشتراک تصویر ممکن نشد. می‌توانید فایل را ذخیره کنید.</p>:null}
          {prepareFailed===style.id&&!readyToShare?
            <p role="alert">آماده‌سازی تصویر برای اشتراک ممکن نشد؛ از ذخیره تصویر یا کپی لینک استفاده کنید.</p>:null}
          <button type="button" className="nail-detail__share-button" onClick={share}
            aria-label={`کپی لینک طرح ${style.title}`}>
            <Icon name="share" size={19} />
            <span>اشتراک لینک همین طرح</span>
          </button>
          {shareStatus==="copied" ? <p role="status">لینک طرح کپی شد.</p> : null}
          {shareStatus==="manual" ? (
            <div className="nail-detail__share-fallback">
              <label htmlFor="nail-share-link">کپی خودکار ممکن نبود؛ لینک را از این بخش کپی کنید.</label>
              <input id="nail-share-link" dir="ltr" value={manualLink}
                onFocus={event=>event.currentTarget.select()} readOnly aria-label="لینک قابل کپی طرح"/>
            </div>
          ) : null}
        </div>
        {service ? <p className="nail-detail__note">خدمت پیشنهادی: {service.title} · مدت تقریبی {formatMinutes(service.minutes)} · قیمت پس از مشاوره</p> : null}
        <span className="nail-detail__en" lang="en">HANANEH BEAUTY / NAIL ATELIER</span>
      </article>
    </Sheet>
  );
}
