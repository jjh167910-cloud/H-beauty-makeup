import { useState } from "react";
import { lookSrc } from "@/data/catalog";
import { SALON } from "@/data/salon";
import { useSalon } from "@/lib/salon-store";
import { Icon } from "./icons";
import { Wordmark } from "./logo";
import { Button, Media } from "./ui";

export function Welcome() {
  const welcome = useSalon((state) => state.welcome);
  const setProfile = useSalon((state) => state.setProfile);
  const [name, setName] = useState("");
  const [leaving, setLeaving] = useState(false);

  function enter() {
    if (leaving) return;
    if (name.trim()) setProfile({ name: name.trim() });
    setLeaving(true);
    window.setTimeout(welcome, 250);
  }

  return (
    <div className="welcome modern-welcome" data-leaving={leaving ? "" : undefined}
      role="dialog" aria-modal="true" aria-label={`به ${SALON.name} خوش آمدید`}>
      <div className="modern-welcome__inner">
        <header className="modern-welcome__brand">
          <Wordmark latin={false} />
          <span lang="en">HANANEH · BEAUTY SALON</span>
        </header>
        <Media className="modern-welcome__image" src={lookSrc(1)}
          alt="نمونه استایل مو از مجموعه حنانه بیوتی" />
        <div className="modern-welcome__content">
          <p className="modern-welcome__tag">به سالن زیبایی حنانه خوش آمدید</p>
          <h1>استایل دلخواهتان را اینجا پیدا کنید.</h1>
          <p>از مدل مو و رنگ تا میکاپ و مراقبت؛ سلیقه‌تان را کشف کنید و برای خدمات دلخواهتان درخواست نوبت بدهید.</p>
          <label className="modern-welcome__field">
            <span>نام شما (اختیاری)</span>
            <input type="text" autoComplete="given-name" value={name}
              placeholder="چه نامی برایتان بنویسیم؟"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") enter(); }} />
          </label>
          <Button size="lg" block icon="forward" disabled={leaving} onClick={enter}>شروع و مشاهده مدل‌ها</Button>
          <p className="modern-welcome__privacy"><Icon name="privacy" size={15} /> اطلاعات شما فقط روی همین دستگاه ذخیره می‌شود.</p>
        </div>
      </div>
    </div>
  );
}
