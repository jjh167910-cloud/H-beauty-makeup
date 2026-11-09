import { toast } from "sonner";
import { familyById, lookThumb, persian, type Family } from "@/data/catalog";
import { SALON } from "@/data/salon";
import { useSalon, type ThemePref } from "@/lib/salon-store";
import { Icon, type IconName } from "../icons";
import { Wordmark } from "../logo";
import { Button, Media, SectionHead, TextLink, useSalonActions } from "../ui";

const THEMES: Array<{ key: ThemePref; label: string; icon: IconName }> = [
  { key: "light", label: "روشن", icon: "light" },
  { key: "dark", label: "تیره", icon: "dark" },
  { key: "system", label: "خودکار", icon: "auto" },
];

export function MeScreen() {
  const { go, openSheet, openBooking } = useSalonActions();
  const profile = useSalon((state) => state.profile);
  const setProfile = useSalon((state) => state.setProfile);
  const favs = useSalon((state) => state.favs);
  const compare = useSalon((state) => state.compare);
  const bookings = useSalon((state) => state.bookings);
  const theme = useSalon((state) => state.theme);
  const setTheme = useSalon((state) => state.setTheme);
  const showSaved = useSalon((state) => state.showSaved);
  const clearData = useSalon((state) => state.clearData);
  const saved = favs.map((id) => familyById.get(id)).filter((family): family is Family => Boolean(family)).reverse();

  const actions: Array<{ name: string; hint: string; icon: IconName; onClick: () => void }> = [
    { name: "مقایسه استایل‌ها", hint: compare.length ? `${persian(compare.length)} مدل در کنار هم` : "انتخاب تا سه مدل", icon: "compare", onClick: () => openSheet({ kind: "compare" }) },
    { name: "راهنمای انتخاب استایل", hint: "پیشنهاد بر اساس سلیقه و فرم چهره", icon: "finder", onClick: () => openSheet({ kind: "finder" }) },
    { name: "گفت‌وگو درباره مدل‌ها", hint: "متن مشاوره با انتخاب‌های شما", icon: "consult", onClick: () => openSheet({ kind: "consult" }) },
  ];

  return (
    <div className="studio-page studio-profile pt-2">
      <header className="studio-head px-gutter">
        <span className="studio-kicker">حساب کاربری</span>
        <h1>حساب <em>کاربری شما</em></h1>
        <p>مشخصات، مدل‌های ذخیره‌شده، درخواست‌های نوبت و تنظیمات برنامه را مدیریت کنید.</p>
      </header>

      <section className="px-gutter">
        <div className="studio-profile__pass">
          <div className="studio-profile__pass-top">
            <span className="studio-profile__serial" lang="en">H. / PRIVATE ATELIER</span>
            <Wordmark className="text-[1.05rem] [&_.wordmark__en]:text-white/45" latin={false} />
          </div>
          <div className="studio-profile__portrait" aria-hidden="true">{profile.name.trim().charAt(0) || "ح"}</div>
          <label className="studio-profile__field">
            <span>نام شما</span>
            <input value={profile.name} onChange={(event) => setProfile({ name: event.target.value })}
              placeholder="نام خود را وارد کنید" autoComplete="name" />
          </label>
          <label className="studio-profile__field">
            <span>شماره همراه · اختیاری</span>
            <input value={profile.phone} onChange={(event) => setProfile({ phone: event.target.value })}
              placeholder="شماره همراه برای آماده‌سازی درخواست" inputMode="tel" autoComplete="tel" dir="ltr" />
          </label>
          <span className="studio-profile__pass-footer" lang="en">YOUR BEAUTY, YOUR SIGNATURE</span>
        </div>
      </section>

      <div className="studio-profile__metrics px-gutter">
        <button type="button" onClick={() => { showSaved(); go("looks"); }}><strong>{persian(favs.length)}</strong><span>استایل ذخیره‌شده</span></button>
        <button type="button" onClick={() => go("bookings")}><strong>{persian(bookings.length)}</strong><span>درخواست نوبت</span></button>
        <button type="button" onClick={() => openSheet({ kind: "compare" })}><strong>{persian(compare.length)}</strong><span>برای مقایسه</span></button>
      </div>

      <section className="studio-profile__saved">
        <SectionHead eyebrow="YOUR EDIT" title="استایل‌های محبوب" action={<TextLink onClick={() => { showSaved(); go("looks"); }}>مشاهده همه</TextLink>} />
        {saved.length ? (
          <div className="rail">
            {saved.slice(0, 10).map((family) => (
              <button key={family.id} type="button" className="studio-profile__saved-look" onClick={() => openSheet({ kind: "look", id: family.id })}>
                <Media src={lookThumb(family.repId)} alt={family.name} loading="lazy" />
                <span>{family.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="px-gutter"><button type="button" className="studio-profile__empty" onClick={() => go("looks")}>
            <Icon name="heart" size={23} /><span>اولین استایل محبوبتان را از لوک‌بوک ذخیره کنید.</span><Icon name="chevron" size={18} />
          </button></div>
        )}
      </section>

      <section className="px-gutter">
        <div className="studio-section-title"><span>فضای شخصی</span><small lang="en">YOUR TOOLS</small></div>
        <div className="studio-profile__actions">
          {actions.map((item, index) => (
            <button key={item.name} type="button" onClick={item.onClick}>
              <span className="studio-profile__action-index">{String(index + 1).padStart(2, "0")}</span>
              <span className="studio-profile__action-icon"><Icon name={item.icon} size={21} weight="duotone" /></span>
              <span className="studio-profile__action-copy"><strong>{item.name}</strong><small>{item.hint}</small></span>
              <Icon name="chevron" size={19} />
            </button>
          ))}
        </div>
      </section>

      <section className="px-gutter">
        <div className="studio-section-title"><span>تنظیمات</span><small lang="en">PREFERENCES</small></div>
        <div className="studio-profile__settings">
          <h2>ظاهر برنامه</h2>
          <div className="segmented" role="radiogroup" aria-label="ظاهر برنامه">
            {THEMES.map((item) => (
              <button key={item.key} type="button" role="radio" aria-checked={theme === item.key} onClick={() => setTheme(item.key)}>
                <Icon name={item.icon} size={17} weight={theme === item.key ? "fill" : "light"} /> {item.label}
              </button>
            ))}
          </div>
          <p className="studio-profile__privacy"><Icon name="privacy" size={18} />نام، شماره همراه، استایل‌های ذخیره‌شده و درخواست‌ها روی همین دستگاه می‌مانند و تا زمانی که خودتان ارسال نکنید، برای {SALON.name} فرستاده نمی‌شوند.</p>
          <Button variant="ghost" icon="trash" className="text-garnet" onClick={() => {
            if (window.confirm("همه اطلاعات ذخیره‌شده روی این دستگاه پاک شود؟")) {
              clearData();
              toast("اطلاعات این دستگاه پاک شد.");
            }
          }}>حذف اطلاعات شخصی این دستگاه</Button>
        </div>
      </section>
      <div className="studio-profile__end px-gutter">
        <span lang="en">HANANEH BEAUTY · SALON</span>
        <Button variant="gold" orb onClick={() => openBooking()}>درخواست نوبت</Button>
      </div>
    </div>
  );
}
