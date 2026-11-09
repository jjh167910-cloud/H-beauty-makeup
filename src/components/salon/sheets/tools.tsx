import { useMemo, useState } from "react";
import { toast } from "sonner";
import { families, familyById, labelOf, lookThumb, persian, type Family } from "@/data/catalog";
import { SALON } from "@/data/salon";
import { cn } from "@/lib/cn";
import { useSalon } from "@/lib/salon-store";
import { copyText, shareText, whatsappLink } from "@/lib/share";
import { Icon } from "../icons";
import { Button, EmptyState, IconButton, Media, useSalonActions } from "../ui";

function resolve(ids: number[]) {
  return ids.map((id) => familyById.get(id)).filter((family): family is Family => Boolean(family));
}

export function CompareBody() {
  const { openSheet, go } = useSalonActions();
  const compare = useSalon((state) => state.compare);
  const clearCompare = useSalon((state) => state.clearCompare);
  const toggleCompare = useSalon((state) => state.toggleCompare);
  const selected = resolve(compare);

  if (!selected.length) {
    return (
      <EmptyState
        icon="compare"
        title="هنوز مدلی برای مقایسه ندارید"
        text="در لوک‌بوک روی آیکن مقایسه هر مدل بزنید. حداکثر سه مدل."
        action={<Button onClick={() => go("looks")}>رفتن به لوک‌بوک</Button>}
      />
    );
  }

  return (
    <div>
      <div className={cn("grid gap-3", selected.length === 1 ? "grid-cols-1" : selected.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
        {selected.map((family) => (
          <article key={family.id} className="relative">
            <button type="button" className="tile w-full" onClick={() => openSheet({ kind: "look", id: family.id })}>
              <Media src={lookThumb(family.repId)} alt={family.name} className="tile__media salon-hair-reference-photo" />
              <span className="t-caption mt-2 line-clamp-2 font-medium">{family.name}</span>
              <span className="t-caption text-ink-2">{labelOf(family.category)}</span>
            </button>
            <IconButton icon="close" label={`حذف ${family.name} از مقایسه`} variant="glass" size="sm" className="absolute top-[30%] start-1.5" onClick={() => toggleCompare(family.id)} />
          </article>
        ))}
      </div>
      <div className="mt-6 flex gap-2">
        <Button icon="consult" className="flex-1" onClick={() => openSheet({ kind: "consult" })}>مشاوره درباره این مدل‌ها</Button>
        <Button variant="tonal" onClick={clearCompare}>پاک کردن</Button>
      </div>
    </div>
  );
}

export function ConsultBody() {
  const { go } = useSalonActions();
  const compare = useSalon((state) => state.compare);
  const favs = useSalon((state) => state.favs);
  const profile = useSalon((state) => state.profile);
  const selected = useMemo(() => resolve([...new Set([...compare, ...favs])]), [compare, favs]);
  const [notes, setNotes] = useState("");

  const draft = useMemo(() => {
    const lines = ["سلام، وقت بخیر.", `برای مشاوره انتخاب مدل مو با ${SALON.name} پیام می‌دهم.`];
    if (profile.name.trim()) lines.push(`نام: ${profile.name.trim()}`);
    if (selected.length) {
      lines.push("مدل‌های انتخابی:");
      selected.forEach((family) => lines.push(`${family.code} — ${family.name}`));
    }
    if (notes.trim()) lines.push(`توضیحات: ${notes.trim()}`);
    lines.push("لطفاً راهنمایی بفرمایید.");
    return lines.join("\n");
  }, [notes, profile.name, selected]);
  const wa = whatsappLink(draft);

  return (
    <div className="grid grid-cols-1 gap-5">
      <p className="t-callout text-ink-2">مدل‌های ذخیره‌شده و مقایسه‌شده در یک پیام آماده می‌شوند تا برای آرتیست بفرستید.</p>
      {selected.length ? (
        <div className="rail -mx-gutter gap-2">
          {selected.map((family) => <Media key={family.id} src={lookThumb(family.repId)} alt={family.name} className="salon-hair-reference-photo salon-hair-reference-photo--small" />)}
        </div>
      ) : (
        <button type="button" className="card t-callout text-ink-2" data-variant="outline" onClick={() => go("looks")}>
          هنوز مدلی انتخاب نشده · افزودن از لوک‌بوک
        </button>
      )}
      <label className="field">
        <span>برای چه مراسم یا استایلی؟ (اختیاری)</span>
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="مثلاً عروسی خواهرم، موهای بلند و نازک دارم" />
      </label>
      <details className="card" data-variant="sunken">
        <summary className="t-callout font-medium">پیش‌نمایش پیام · {persian(selected.length)} مدل</summary>
        <pre className="t-caption mt-3 font-sans whitespace-pre-wrap text-ink-2">{draft}</pre>
      </details>
      <div className="grid gap-2">
        {wa ? (
          <a href={wa} target="_blank" rel="noreferrer" className="btn" data-variant="gold"><Icon name="whatsapp" size={18} weight="regular" /> ارسال در واتساپ</a>
        ) : (
          <Button variant="gold" icon="send" onClick={async () => { const result = await shareText(draft, "درخواست مشاوره"); if (result === "copied") toast("متن درخواست کپی شد."); else if (result === "failed") toast("اشتراک‌گذاری ممکن نشد."); }}>
            ارسال پیام مشاوره
          </Button>
        )}
        <Button variant="tonal" icon="copy" onClick={async () => toast((await copyText(draft)) === "copied" ? "متن درخواست کپی شد." : "کپی ممکن نشد.")}>کپی متن</Button>
      </div>
      <p className="t-caption text-center text-ink-2">این فرم خودکار چیزی ارسال نمی‌کند؛ پیام را خودتان می‌فرستید.</p>
    </div>
  );
}

const FACES = [
  { key: "oval", label: "بیضی", note: "پیشانی و فک متعادل" },
  { key: "round", label: "گرد", note: "گونه‌های نرم و فک منحنی" },
  { key: "square", label: "مربعی", note: "فک مشخص و زاویه‌دار" },
  { key: "heart", label: "قلبی", note: "پیشانی باز و چانه ظریف" },
  { key: "long", label: "کشیده", note: "طول صورت بیشتر از عرض" },
];
const TEXTURES = [
  { key: "fine", label: "نازک", note: "حجم کم، صاف" },
  { key: "natural", label: "نرمال", note: "متوسط و انعطاف‌پذیر" },
  { key: "curly", label: "موج‌دار / فر", note: "بافت طبیعی و پرحجم" },
];
const ROUTINES = [
  { key: "quick", label: "کمتر از ۱۰ دقیقه", note: "کم‌دردسر و سریع" },
  { key: "medium", label: "۱۵ تا ۲۰ دقیقه", note: "کمی حوصله دارم" },
  { key: "full", label: "عاشق استایل دادنم", note: "هر روز یک لوک تازه" },
];
const QUESTIONS = [
  { title: "فرم صورتت به کدام نزدیک‌تر است؟", options: FACES },
  { title: "جنس مویت بیشتر شبیه کدام است؟", options: TEXTURES },
  { title: "روزانه چقدر برای حالت دادن وقت داری؟", options: ROUTINES },
];

function recommend(face: string, texture: string, routine: string) {
  const preferred = face === "round" ? ["waves", "curly", "updo"] : face === "square" ? ["waves", "curly", "bob"] : face === "heart" ? ["bob", "braid", "waves"] : face === "long" ? ["curly", "bob", "waves"] : ["waves", "straight", "updo"];
  const textureBoost = texture === "curly" ? ["curly", "waves", ...preferred] : texture === "fine" ? ["straight", "bob", ...preferred] : preferred;
  const order = routine === "quick" ? ["bob", "straight", "pixie", ...textureBoost] : textureBoost;
  const picks = [...new Set(order)].map((category) => families.find((family) => family.category === category)).filter((family): family is Family => Boolean(family)).slice(0, 3);
  return picks.length ? picks : families.slice(0, 3);
}

export function FinderBody() {
  const { openSheet, openBooking, go } = useSalonActions();
  const setFilter = useSalon((state) => state.setFilter);
  const [answers, setAnswers] = useState<string[]>([]);
  const step = answers.length;

  if (step >= QUESTIONS.length) {
    const [face, texture, routine] = answers;
    const picks = recommend(face, texture, routine);
    return (
      <div className="rise">
        <p className="t-eyebrow">انتخاب ویژه شما</p>
        <h3 className="t-title-1 mt-1">سه پیشنهاد <span className="t-calligraphy text-gold-ink">برای شما</span></h3>
        <p className="t-callout mt-2 text-ink-2">
          برای صورت <strong className="text-ink">{FACES.find((item) => item.key === face)?.label}</strong> با موی {TEXTURES.find((item) => item.key === texture)?.label}، این استایل‌ها هماهنگی بیشتری دارند.
        </p>
        <div className="mt-5 grid grid-cols-3 gap-3">
          {picks.map((family) => (
            <button key={family.id} type="button" className="tile" onClick={() => openSheet({ kind: "look", id: family.id })}>
              <Media src={lookThumb(family.repId)} alt={family.name} className="tile__media salon-hair-reference-photo" />
              <span className="t-caption mt-2 text-gold-ink">{labelOf(family.category)}</span>
              <span className="t-caption line-clamp-2 font-medium">{family.name}</span>
            </button>
          ))}
        </div>
        <div className="mt-6 grid gap-2">
          <Button variant="gold" size="lg" orb onClick={() => openBooking({ service: "signature-cut", lookId: picks[0]?.id })}>درخواست مشاوره و کوپ</Button>
          <div className="flex gap-2">
            <Button variant="tonal" className="flex-1" onClick={() => { setFilter(picks[0]?.category ?? "all"); go("looks"); }}>مدل‌های مشابه</Button>
            <Button variant="secondary" icon="rebook" className="flex-1" onClick={() => setAnswers([])}>از نو</Button>
          </div>
        </div>
        <p className="t-caption mt-4 text-center text-ink-2">پیشنهاد بر اساس پاسخ‌های شماست، نه تحلیل عکس؛ آرتیست تناسب نهایی را در سالن تأیید می‌کند.</p>
      </div>
    );
  }

  const question = QUESTIONS[step];
  return (
    <div>
      <div className="flex items-center gap-3">
        {step > 0 ? <IconButton icon="back" label="سؤال قبل" size="sm" onClick={() => setAnswers(answers.slice(0, -1))} /> : null}
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={3} aria-valuenow={step + 1}>
          <div className="foil h-full rounded-full transition-all duration-500" style={{ width: `${((step + 1) / QUESTIONS.length) * 100}%` }} />
        </div>
        <span className="t-caption t-numeric text-ink-2">{persian(step + 1)} / {persian(QUESTIONS.length)}</span>
      </div>
      <h3 key={step} className="t-title-2 rise mt-6">{question.title}</h3>
      <div key={`options-${step}`} className="rise mt-5 grid gap-2.5">
        {question.options.map((option) => (
          <button key={option.key} type="button" className="choice" onClick={() => setAnswers([...answers, option.key])}>
            <span className="flex-1"><strong className="t-callout block font-medium">{option.label}</strong><span className="t-caption text-ink-2">{option.note}</span></span>
            <Icon name="chevron" size={18} className="text-ink-3" />
          </button>
        ))}
      </div>
    </div>
  );
}
