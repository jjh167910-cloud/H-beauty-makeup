import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const home = readFileSync(new URL("src/components/salon/screens/home.tsx", root), "utf8");
const welcome = readFileSync(new URL("src/components/salon/welcome.tsx", root), "utf8");
const catalog = JSON.parse(readFileSync(new URL("src/data/catalog.json", root), "utf8"));
const familyByRep = new Map(catalog.map(family => [family.repId, family]));

function representative(id) {
  const family = familyByRep.get(id);
  assert.ok(family, "Unknown published hairstyle ID HB-" + String(id).padStart(3, "0"));
  assert.ok(family.variantIds.includes(id), "Representative image must belong to own catalog family");
  assert.ok(family.name.trim(), "Missing Persian image name for " + id);
  return family;
}

test("landing category images are members of the Persian category they advertise", () => {
  const source = /const STYLES = \[([\s\S]*?)\] as const;/.exec(home)?.[1];
  assert.ok(source, "Missing landing category selections");
  const entries = [...source.matchAll(/\{\s*repId:\s*(\d+),\s*filter:\s*"([^"]+)",\s*label:\s*"([^"]+)"/g)];
  assert.equal(entries.length, 5, "Audit all five landing style-category selections");
  const used = new Set();
  for (const [, numericId, filter, label] of entries) {
    const id = Number(numericId);
    const family = representative(id);
    assert.ok(label.trim().length > 2, "Missing Persian landing category label");
    assert.ok(family.category === filter || family.tags.includes(filter),
      "HB-" + id + " is " + family.category + " but is advertised as " + filter);
    assert.ok(!used.has(id), "Repeated landing category image " + id);
    used.add(id);
  }
  assert.match(home, /STYLES\.slice\(0,4\)/, "The four-card mobile rail changed without review");
});

test("landing hero and first-visit portrait refer to the same correctly named style", () => {
  const heroId = Number(/const hero = byRep\((\d+)\)/.exec(home)?.[1]);
  assert.ok(heroId > 0, "Missing home hero ID");
  const family = representative(heroId);
  assert.ok(family.name.length > 8, "Featured portrait has no meaningful Persian title");
  assert.match(welcome, new RegExp("src=\\{lookSrc\\(" + heroId + "\\)\\}"),
    "The welcome portrait must match the landing hero");
  assert.match(home, /\{hero\.name\}/,
    "Hero caption must derive from the same catalog family as the image");
  assert.match(home, /lookSrc\(hero\.repId\)/,
    "Hero image must derive from the named catalog family");
});

test("landing featured photos have unique catalog-backed Persian names", () => {
  const list = /\{\[([\d,\s]+)\]\.map\(\(repId\)/.exec(home)?.[1];
  assert.ok(list, "Missing landing featured-photo roster");
  const ids = list.split(",").map(s => Number(s.trim()));
  assert.equal(ids.length, 4, "Landing featured rail must show four chosen looks");
  assert.equal(new Set(ids).size, 4, "Featured images must not repeat");
  for (const id of ids) representative(id);
  assert.match(home, /lookThumb\(repId\)/, "Featured images must use selected IDs");
  assert.match(home, /\{look\.name\}/, "Featured names must refer to the same style");
});
