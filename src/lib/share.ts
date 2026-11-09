import { familyById } from "@/data/catalog";
import { styleById } from "@/data/makeup-styles";
import { nailById } from "@/data/nail-styles";
import { SALON, formatMinutes, longDate, stylistName, summarize, timeLabel } from "@/data/salon";
import type { BookingRequest } from "./salon-store";

export function bookingMessage(booking: BookingRequest) {
  const { items, minutes } = summarize(booking.services);
  const look = booking.lookId != null ? familyById.get(booking.lookId) : null;
  const lines = [
    `سلام، وقت بخیر. درخواست نوبت برای ${SALON.name}:`,
    "",
    `خدمات: ${items.map((item) => item.title).join("، ")}`,
    `مدت تقریبی: ${formatMinutes(minutes)}`,
    `آرتیست: ${stylistName(booking.stylist)}`,
    `زمان پیشنهادی: ${longDate(booking.date)} · ساعت ${timeLabel(booking.time)}`,
  ];
  if (look) lines.push(`مدل منتخب: ${look.code} — ${look.name}`);
  const makeup = booking.makeupId ? styleById.get(booking.makeupId) : null;
  if (makeup) lines.push(`سبک میکاپ: ${makeup.title} (${makeup.en})`);
  const nail = booking.nailStyleId ? nailById.get(booking.nailStyleId) : null;
  if (nail) lines.push(`طرح ناخن منتخب: ${nail.title} (${nail.en}) — شناسه ${nail.id}`);
  lines.push(`نام: ${booking.name}`, `شماره تماس: ${booking.phone}`);
  if (booking.note.trim()) lines.push(`توضیحات: ${booking.note.trim()}`);
  lines.push("", "لطفاً برای تأیید زمان با من تماس بگیرید. ممنونم.");
  return lines.join("\n");
}

export function whatsappLink(text: string) {
  return SALON.whatsapp ? `https://wa.me/${SALON.whatsapp}?text=${encodeURIComponent(text)}` : null;
}

/** Share through the OS sheet when available, else copy. Resolves to what happened. */
export async function shareText(text: string, title = SALON.name): Promise<"shared" | "copied" | "cancelled" | "failed"> {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }
  return copyText(text);
}

export async function copyText(text: string): Promise<"copied" | "failed"> {
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
