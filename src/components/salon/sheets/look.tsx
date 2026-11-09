import { useState } from "react";
import { toast } from "sonner";
import { labelOf, lookSrc, persian, type Family } from "@/data/catalog";
import { photoObjectPosition } from "@/data/photo-focal";
import { SALON } from "@/data/salon";
import { cn } from "@/lib/cn";
import { useSalon } from "@/lib/salon-store";
import { shareText } from "@/lib/share";
import { Button, IconButton, Sheet, haptic, useSalonActions } from "../ui";

export function LookSheet({ open, family, onClose }: { open: boolean; family: Family; onClose: () => void }) {
  const { openBooking, openSheet } = useSalonActions();
  const saved = useSalon((state) => state.favs.includes(family.id));
  const picked = useSalon((state) => state.compare.includes(family.id));
  const toggleFav = useSalon((state) => state.toggleFav);
  const toggleCompare = useSalon((state) => state.toggleCompare);
  const [index, setIndex] = useState(0);
  const name = family.variantNames[index] ?? family.name;
  const chips = [family.category, ...family.tags.filter((tag) => tag !== family.category && labelOf(tag) !== tag)].slice(0, 3);
  const service = family.category === "updo" || family.category === "braid" ? "event-styling" : family.tags.includes("color") ? "bespoke-balayage" : "signature-cut";

  async function share() {
    const result = await shareText(`${family.name} (${family.code}) — لوک‌بوک ${SALON.name}`);
    if (result === "copied") toast("نام و کد مدل کپی شد.");
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={family.name}
      full
      footer={
        <div className="flex gap-2">
          <IconButton icon="consult" label="مشاوره درباره این مدل" size="lg" onClick={() => openSheet({ kind: "consult" })} />
          <Button variant="gold" size="lg" icon="book" className="flex-1" onClick={() => openBooking({ service, lookId: family.id })}>درخواست این استایل</Button>
        </div>
      }
    >
      <div className="studio-look-detail__header"><span lang="en">HANANEH · BEAUTY LOOKBOOK</span><span lang="en">{family.code}</span></div>
      <div className="look-hero studio-look-detail__hero">
        <div
          className="carousel"
          onScroll={(event) => {
            const node = event.currentTarget;
            const next = Math.round(Math.abs(node.scrollLeft) / node.clientWidth);
            if (next !== index) setIndex(next);
          }}
        >
          {family.variantIds.map((id, itemIndex) => (
            <img key={id} src={lookSrc(id)} alt={family.variantNames[itemIndex] ?? family.name} loading={itemIndex ? "lazy" : "eager"} draggable={false} style={{ animation: "fade 500ms ease both", objectPosition: photoObjectPosition(lookSrc(id), "center") }} />
          ))}
        </div>
      </div>
      <div className="salon25-look-detail__tools">
        {family.variantIds.length > 1 ? (
          <div className="salon25-look-detail__pages" aria-label="تصاویر مدل">
            {family.variantIds.map((id, itemIndex) => (
              <span key={id} className={cn("salon25-look-detail__dot", itemIndex === index && "salon25-look-detail__dot--active")} />
            ))}
          </div>
        ) : <span />}
        <div className="salon25-look-detail__actions">
          <button type="button" className="salon25-look-card__action" aria-pressed={saved}
            onClick={() => { haptic(); toggleFav(family.id); if (!saved) toast("به ذخیره‌ها اضافه شد."); }}>
            {saved ? "ذخیره شد" : "ذخیره"}
          </button>
          <button type="button" className="salon25-look-card__action" aria-pressed={picked}
            onClick={() => { haptic(); if (toggleCompare(family.id) === "limit") toast("برای مقایسه حداکثر سه مدل انتخاب کنید."); }}>
            {picked ? "انتخاب شد" : "مقایسه"}
          </button>
          <button type="button" className="salon25-look-card__action" onClick={share}>اشتراک‌گذاری</button>
        </div>
      </div>
      {family.variantIds.length > 1 ? <p className="t-caption mt-3 text-center text-ink-2">برای دیدن {persian(family.variantIds.length)} برداشت، تصویر را بکشید</p> : null}

      <p className="t-caption mt-6 text-gold-ink" dir="ltr">{family.code}</p>
      <h2 className="t-title-1 studio-look-detail__title mt-1">{name}</h2>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {chips.map((chip) => <span key={chip} className="badge" data-tone="outline">{labelOf(chip)}</span>)}
      </div>
      <p className="studio-look-detail__note">تصاویر برای الهام‌اند؛ انتخاب نهایی با بررسی فرم چهره و جنس مو انجام می‌شود.</p>
      <p className="t-body mt-4 text-ink-2">
        {family.description ||
          (family.variantIds.length > 1
            ? "چند برداشت نزدیک از این استایل را بالا ببینید. تناسب نهایی با جنس و طول موی شما در سالن بررسی می‌شود."
            : "این تصویر نمونه استایل است. تناسب نهایی با جنس و طول موی شما در سالن بررسی می‌شود.")}
      </p>
    </Sheet>
  );
}
