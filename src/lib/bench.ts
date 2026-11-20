/**
 * The artist's bench (/bench): the roadmap's Phase 2 exit gate. She scores each catalog look on her own benchmark photos
 * (kept on her phone: only a hash of each goes with its scores), painted by the old engine and the new one side by side
 * without being told which is which, on the rubric's lines (and her eyes on their own). The new format passes when, on
 * the pictures she scored both ways, it scores at least as well on every line and 1.0 higher on eyes, and every look in
 * the catalog scores 4 or more.
 */
import type { BenchCard } from "@/lib/chat";

/**
 * The rubric's lines: the question she answers for each picture, what to look at it against («مرجع»: the look on the
 * catalog model; «بدون میکاپ»: her photo untouched), and what a 1 and a 5 mean.
 */
export const BENCH_LINES = [
  { id: "placement", name: "جای‌گذاری", ask: "هر محصول همان جایی نشسته که در مرجع است؟ سایه تا چین پلک، خط چشم روی ریشه‌ی مژه، رژگونه روی گونه، رژ دقیقاً روی لب.",
    against: "با «مرجع» مقایسه کنید", low: "جای اشتباه: مثلاً سایه تا ابرو رفته یا رژ از لب بیرون زده", high: "همان جای مرجع، اندازه‌ی صورت خود او" },
  { id: "colour", name: "رنگ واقعی", ask: "رنگ‌ها همان‌اند که این محصولات روی پوست همین آدم می‌شوند؟ (روی پوست او کمی با مرجع فرق دارند و این درست است.)",
    against: "با «مرجع» و «بدون میکاپ» مقایسه کنید", low: "رنگ اشتباه، کدر، یا مثل فیلتر رنگی", high: "همان رنگی که محصول واقعی روی پوست او می‌شد" },
  { id: "edges", name: "لبه‌ها", ask: "لبه‌ی رژ، خط چشم و سایه مثل کار دست یک آرتیست است؟",
    against: "عکس را بزرگ کنید و از نزدیک ببینید", low: "تیز، لرزان، دندانه‌دار یا بیرون‌زده", high: "تمیز و نرم، مثل کار حرفه‌ای" },
  { id: "skin", name: "بافت پوست", ask: "پوست هنوز پوست واقعی خود اوست؟ منافذ، کک‌مک، خال و خطوط ریزش دیده می‌شود؟",
    against: "با «بدون میکاپ» مقایسه کنید", low: "مثل ماسک، پلاستیکی یا لکه‌دار", high: "پوست خود او، فقط با کرم‌پودر" },
  { id: "eyes", name: "چشم‌ها", ask: "سایه، خط چشم و مژه با هم باورپذیرند و شکل چشم خودش عوض نشده؟",
    against: "بزرگ کنید؛ با «مرجع» و «بدون میکاپ» مقایسه کنید", low: "چشم عوض شده یا میکاپ چشم نقاشی‌شده و چسبیده به نظر می‌رسد", high: "مثل عکس واقعی از چشمی که میکاپ شده" },
  { id: "client", name: "به مشتری نشانش می‌دهم", ask: "اگر این عکس از کار خود شما بود، به مشتری نشانش می‌دادید؟",
    against: "نگاه کلی، مثل مشتری", low: "هرگز", high: "حتماً، با افتخار" },
] as const;
export type BenchLine = (typeof BENCH_LINES)[number]["id"];

/** The gate: a look ships at this score or more; the new engine's eyes this much over the old one's. */
export const GATE = { look: 4, eyes: 1 } as const;

const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const overall = (c: BenchCard) => mean(BENCH_LINES.map((l) => c.scores[l.id] ?? 0))!;

export type Gate = {
  /** Pictures scored both ways (a look on a photo). */
  pairs: number;
  /** Per line: the old and the new engine's mean over those pictures. */
  lines: Array<{ id: BenchLine; name: string; v1: number | null; v2: number | null }>;
  /** The new engine's eyes over the old one's (those pictures). */
  eyesGain: number | null;
  /** Per catalog look: the new engine's mean over all its lines and photos (null: not scored yet). */
  looks: Array<{ look: string; v2: number | null; photos: number }>;
  pass: { lines: boolean; eyes: boolean; looks: boolean; all: boolean };
};

export function benchGate(cards: BenchCard[], catalog: string[]): Gate {
  const key = (c: BenchCard) => `${c.look}|${c.photo}`;
  const v1 = new Map(cards.filter((c) => c.engine === "v1").map((c) => [key(c), c]));
  const pairs = cards.filter((c) => c.engine === "v2" && v1.has(key(c))).map((c) => [v1.get(key(c))!, c] as const);
  const lines = BENCH_LINES.map((l) => ({ id: l.id, name: l.name, v1: mean(pairs.map(([a]) => a.scores[l.id])), v2: mean(pairs.map(([, b]) => b.scores[l.id])) }));
  const eyes = lines.find((l) => l.id === "eyes")!;
  const eyesGain = eyes.v1 == null || eyes.v2 == null ? null : eyes.v2 - eyes.v1;
  const looks = catalog.map((look) => {
    const mine = cards.filter((c) => c.engine === "v2" && c.look === look);
    return { look, v2: mean(mine.map(overall)), photos: mine.length };
  });
  const pass = {
    lines: pairs.length > 0 && lines.every((l) => (l.v2 ?? 0) >= (l.v1 ?? 0)),
    eyes: eyesGain != null && eyesGain >= GATE.eyes - 1e-9,
    looks: looks.every((l) => l.v2 != null && l.v2 >= GATE.look - 1e-9),
    all: false,
  };
  pass.all = pass.lines && pass.eyes && pass.looks;
  return { pairs: pairs.length, lines, eyesGain, looks, pass };
}

/** Which of a look's two pictures on a photo is the new engine's: «الف» or «ب», the same every time, not always one side. */
export function newIsFirst(look: string, photo: string): boolean {
  let h = 2166136261;
  for (const ch of `${look}|${photo}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) & 1) === 1;
}

/** A photo's id for its scores: the first 16 hex digits of its file's SHA-256 (the photo itself never leaves her phone). */
export async function photoId(file: Blob): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
  return [...hash.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
