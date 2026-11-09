import type { NailStyle } from "@/data/nail-styles";
import { NAIL_FINISHES, NAIL_SHAPES } from "@/data/nail-styles";
import { serviceById } from "@/data/salon";
import { NailVisual } from "../nail-visual";
import { Button, Sheet, useSalonActions } from "../ui";

type Props = {
  first: NailStyle;
  second: NailStyle;
  open: boolean;
  onClose: () => void;
};

const finishName = (style: NailStyle) =>
  NAIL_FINISHES.find(item=>item.key===style.finish)?.title ?? style.finish;
const shapeName = (style: NailStyle) =>
  NAIL_SHAPES.find(item=>item.key===style.shape)?.title ?? style.shape;
const lengthName = (style: NailStyle) =>
  style.length==="short" ? "کوتاه" : style.length==="medium" ? "متوسط" : "بلند";

export function NailCompareSheet({first,second,open,onClose}:Props) {
  const {openBooking} = useSalonActions();
  const styles=[first,second];
  const book=(style:NailStyle)=>{
    onClose();
    openBooking({service:style.serviceId,nailStyleId:style.id});
  };
  return (
    <Sheet open={open} onClose={onClose} title="مقایسه طرح‌های ناخن" full>
      <section className="nail-compare" aria-label="مقایسه دو طرح ناخن">
        <p className="nail-compare__intro">دو طرح انتخابی را از نظر رنگ، فرم، جلوه و خدمات پیشنهادی مقایسه کنید.</p>
        <div className="nail-compare__grid">
          {styles.map((style,i)=>(
            <article key={style.id} className="nail-compare__design" aria-label={`طرح ${i+1}: ${style.title}`}>
              <div className="nail-compare__visual"><NailVisual style={style}/></div>
              <div className="nail-compare__identity">
                <small lang="en">{style.en}</small>
                <h3>{style.title}</h3>
              </div>
              <dl className="nail-compare__specs">
                <div><dt>جلوه</dt><dd>{finishName(style)}</dd></div>
                <div><dt>فرم</dt><dd>{shapeName(style)}</dd></div>
                <div><dt>طول</dt><dd>{lengthName(style)}</dd></div>
                <div><dt>خدمت</dt><dd>{serviceById.get(style.serviceId)?.title ?? "مشاوره"}</dd></div>
              </dl>
              <Button variant="gold" size="md" onClick={()=>book(style)}>
                درخواست همین طرح
              </Button>
            </article>
          ))}
        </div>
        <p className="nail-compare__disclosure">
          پیش‌نمایش‌ها برای الهام و مقایسهٔ رنگ و سبک هستند، نه عکس نتیجهٔ واقعی خدمات سالن.
          قیمت و امکان اجرای نهایی پس از مشاوره مشخص می‌شود.
        </p>
      </section>
    </Sheet>
  );
}
