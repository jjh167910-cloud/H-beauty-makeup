import raw from "./catalog.json";

export type Family = {
  id: number;
  repId: number;
  code: string;
  name: string;
  category: string;
  tags: string[];
  variantIds: number[];
  variantNames: string[];
  description: string;
  searchText: string;
};

export const families = raw as Family[];
export const familyById = new Map(families.map((family) => [family.id, family]));
export const FAMILY_COUNT = families.length;
export const IMAGE_COUNT = families.reduce((sum, family) => sum + family.variantIds.length, 0);

export const COLLECTIONS = [
  { key: "straight", label: "صاف و براشینگ", note: "خط تمیز، سطح براق" },
  { key: "waves", label: "موج و ویو", note: "حرکت نرم و باز" },
  { key: "curly", label: "فر و حجم", note: "بافت طبیعی و پر" },
  { key: "bob", label: "باب و لاب", note: "از فک تا شانه" },
  { key: "pixie", label: "پیکسی و کوتاه", note: "کوتاه، دقیق، جسور" },
  { key: "updo", label: "شینیون و جمع", note: "مراسم و مهمانی" },
  { key: "ponytail", label: "دم‌اسبی و نیمه‌باز", note: "روزمره تا رسمی" },
  { key: "braid", label: "بافت و تزئینی", note: "الگو و جزئیات" },
] as const;

export const FILTERS = [
  { key: "all", label: "همه مدل‌ها" },
  ...COLLECTIONS.map(({ key, label }) => ({ key, label })),
  { key: "editorial", label: "مدل‌های خاص" },
  { key: "color", label: "رنگ و هایلایت" },
  { key: "fringe", label: "چتری" },
] as const;

const LABELS: Record<string, string> = Object.fromEntries(FILTERS.map((item) => [item.key, item.label]));

export function labelOf(key: string) {
  return LABELS[key] ?? key;
}

export function countInCategory(key: string) {
  return families.filter((family) => family.category === key).length;
}

export function lookSrc(id: number) {
  return `/looks/${id}.webp`;
}

/** 560px thumbnail for grids and rails; full-size `lookSrc` is for immersive views. */
export function lookThumb(id: number) {
  return `/looks/sm/${id}.webp`;
}

export function byRep(repId: number) {
  return families.find((family) => family.repId === repId);
}

export function picks(repIds: number[]) {
  return repIds.map(byRep).filter((family): family is Family => Boolean(family));
}

export const HERO = byRep(30) ?? families[0];
export const FEATURED = picks([27, 30, 26, 119, 92]);
export const UPDOS = picks([213, 206, 110, 203, 49]);
export const BRAIDS = picks([77, 92, 95, 98, 221]);
export const STAGE = picks([30, 27, 26, 119, 4, 43, 213, 77]);

export function countFor(key: string) {
  if (key === "all") return FAMILY_COUNT;
  return families.filter((family) => family.category === key || family.tags.includes(key)).length;
}

const SHORT_LOOK = /پیکسی|بازکات|مالت|موهاک|فوهاوک|کروکات|کاسه|آندرکات|کوتاه/;

export function isShortLook(family: Family) {
  if (family.category === "pixie") return true;
  if (family.name.includes("بلند")) return false;
  return SHORT_LOOK.test(family.name);
}

const SHOWCASE_ORDER = ["waves", "straight", "curly", "ponytail", "braid", "updo", "bob", "editorial", "pixie"];

export function showcaseRank(family: Family) {
  if (isShortLook(family)) return 100;
  const index = SHOWCASE_ORDER.indexOf(family.category);
  return index === -1 ? 90 : index;
}

function stripe(items: Family[]) {
  const buckets = new Map<string, Family[]>();
  for (const item of items) {
    const bucket = buckets.get(item.category);
    if (bucket) bucket.push(item);
    else buckets.set(item.category, [item]);
  }
  const keys = [...buckets.keys()].sort((a, b) => {
    const left = SHOWCASE_ORDER.indexOf(a);
    const right = SHOWCASE_ORDER.indexOf(b);
    return (left < 0 ? 50 : left) - (right < 0 ? 50 : right);
  });
  const depth = Math.max(0, ...[...buckets.values()].map((bucket) => bucket.length));
  const out: Family[] = [];
  for (let index = 0; index < depth; index++) {
    for (const key of keys) {
      const item = buckets.get(key)?.[index];
      if (item) out.push(item);
    }
  }
  return out;
}

export function diverseOrder(list: Family[]) {
  const long: Family[] = [];
  const short: Family[] = [];
  for (const item of list) (isShortLook(item) ? short : long).push(item);
  long.sort((a, b) => a.id - b.id);
  short.sort((a, b) => a.id - b.id);
  return [...stripe(long), ...stripe(short)];
}

export function persian(value: number) {
  return new Intl.NumberFormat("fa-IR").format(value);
}

export function normalize(value: string) {
  return value
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u200c/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function matchesFamily(family: Family, query: string, filter: string, savedOnly: boolean, favs: Set<number>) {
  const q = normalize(query);
  const hay = normalize(
    `${family.searchText} ${family.name} ${family.code} ${labelOf(family.category)} ${family.tags.map(labelOf).join(" ")}`,
  );
  const textOk = !q || hay.includes(q);
  const catOk = filter === "all" || family.category === filter || family.tags.includes(filter);
  const savedOk = !savedOnly || favs.has(family.id);
  return textOk && catOk && savedOk;
}
