import { toast } from "sonner";
import { SERVICE_CATEGORIES, STYLISTS, formatMinutes, formatPrice, type Service } from "@/data/salon";
import { useSalon } from "@/lib/salon-store";
import { Icon } from "../icons";
import { Avatar, Button, Sheet, haptic, useSalonActions } from "../ui";

export function ServiceSheet({ open, service, onClose }: { open: boolean; service: Service; onClose: () => void }) {
  const { openBooking } = useSalonActions();
  const picked = useSalon((state) => state.cart.includes(service.id));
  const toggleCart = useSalon((state) => state.toggleCart);
  const category = SERVICE_CATEGORIES.find((item) => item.key === service.category);
  const artists = STYLISTS.filter((stylist) => stylist.focus.includes(service.category));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={category?.label ?? "خدمت"}
      footer={
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="lg"
            icon={picked ? "check" : "plus"}
            aria-pressed={picked}
            onClick={() => {
              haptic();
              toast(toggleCart(service.id) ? "به خدمات انتخابی اضافه شد." : "از خدمات انتخابی حذف شد.");
            }}
          >
            {picked ? "انتخاب شد" : "افزودن"}
          </Button>
          <Button variant="gold" size="lg" className="flex-1" onClick={() => openBooking({ service: service.id })}>درخواست این خدمت</Button>
        </div>
      }
    >
      <div className="studio-service-detail__hero">
        <span lang="en">{service.en}</span>
        <span className="studio-service-detail__mark" aria-hidden="true"><Icon name={service.category} size={44} weight="duotone" /></span>
        <h2>{service.title}</h2>
        <p>{service.detail}</p>
      </div>
      <p className="studio-service-detail__eyebrow">خدمت انتخابی · اطلاعات و شرایط</p>

      <div className="mt-6 grid grid-cols-2 border-y border-line">
        <div className="py-4 pe-4">
          <Icon name="clock" size={20} className="text-gold" />
          <p className="t-caption mt-2 text-ink-2">مدت تقریبی</p>
          <p className="t-headline">{formatMinutes(service.minutes)}</p>
        </div>
        <div className="border-s border-line py-4 ps-4">
          <Icon name="price" size={20} className="text-gold" />
          <p className="t-caption mt-2 text-ink-2">شروع قیمت</p>
          <p className="t-headline">{service.price ? `${formatPrice(service.price)} تومان` : formatPrice(null)}</p>
        </div>
      </div>

      <h3 className="t-headline mt-7">آنچه دریافت می‌کنید</h3>
      <ul className="mt-3 grid gap-3">
        {service.includes.map((item) => (
          <li key={item} className="t-callout flex items-center gap-3"><Icon name="check" size={16} weight="bold" className="shrink-0 text-gold" />{item}</li>
        ))}
      </ul>

      {artists.length ? (
        <>
          <h3 className="t-headline mt-7">آرتیست‌های این خدمت</h3>
          <div className="list mt-3">
            {artists.map((stylist) => (
              <button key={stylist.id} type="button" className="list-row" onClick={() => openBooking({ service: service.id, stylist: stylist.id })}>
                <Avatar name={stylist.name} tone={stylist.tone} className="size-11 text-lg" />
                <span className="flex-1"><strong className="t-callout block font-medium">{stylist.name}</strong><span className="t-caption text-ink-2">{stylist.role}</span></span>
                <span className="link">درخواست</span>
              </button>
            ))}
          </div>
        </>
      ) : null}
      <p className="t-caption mt-6 text-ink-2">قیمت نهایی پس از بررسی طول، حجم و سابقه رنگ مو در سالن اعلام می‌شود.</p>
    </Sheet>
  );
}
