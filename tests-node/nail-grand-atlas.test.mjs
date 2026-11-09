import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const expansion=readFileSync("src/data/nail-expansion.ts","utf8");
const originals=readFileSync("src/data/nail-styles.ts","utf8");
const section=(name,endMarker)=>{
  const start=expansion.indexOf(name);
  assert.ok(start>=0,"Missing data section "+name);
  const tail=expansion.slice(start);
  const end=tail.indexOf(endMarker);
  assert.ok(end>=0,"Unterminated data section "+name);
  return tail.slice(0,end);
};
const shades=section("const SHADES:","];");
const manicure=section("const MANICURE_FAMILIES:","];");
const pedicure=section("const PEDICURE_FAMILIES:","];");

const shadeEntries=[...shades.matchAll(/\{id:"([^"]+)",fa:"([^"]+)",en:"([^"]+)",base:"(#[A-Fa-f0-9]{6})",accent:"(#[A-Fa-f0-9]{6})",color:"([^"]+)"\}/g)];
const manicureEntries=[...manicure.matchAll(/\{id:"([^"]+)",fa:"([^"]+)",en:"([^"]+)",detail:"([^"]+)",finish:"([^"]+)",motif:"([^"]+)",shape:"([^"]+)",length:"([^"]+)"\}/g)];
const pediEntries=[...pedicure.matchAll(/\{id:"([^"]+)",fa:"([^"]+)",en:"([^"]+)",detail:"([^"]+)",finish:"([^"]+)",motif:"([^"]+)",shape:"([^"]+)",length:"([^"]+)"\}/g)];
const originalIds=[...originals.matchAll(/\bid:"((?:nail|pedi)-[^"]+)"/g)].map(v=>v[1]);
const newMani=manicureEntries.flatMap(f=>shadeEntries.map(s=>"nail-atlas-"+f[1]+"-"+s[1]));
const newPedi=pediEntries.flatMap(f=>shadeEntries.filter((s,i)=>[0,1,3,6,7,9].includes(i)).map(s=>"pedi-atlas-"+f[1]+"-"+s[1]));

test("298 unique nail IDs: 28+192 manicures and 6+72 pedicures",()=>{
  assert.equal(shadeEntries.length,12);
  assert.equal(manicureEntries.length,16);
  assert.equal(pediEntries.length,12);
  assert.equal(originalIds.length,34);
  assert.equal(newMani.length,192);
  assert.equal(newPedi.length,72);
  const all=[...originalIds,...newMani,...newPedi];
  assert.equal(all.length,298);
  assert.equal(new Set(all).size,298,"No saved reference IDs may collide");
  assert.equal(new Set(manicureEntries.map(f=>f[1])).size,16);
});

test("12 finish categories, 16 motif families, and unique Persian/English combinations",()=>{
  const finishes=new Set(manicureEntries.map(f=>f[5]));
  const motifs=new Set(manicureEntries.map(f=>f[6]));
  assert.equal(finishes.size,12);
  assert.equal(motifs.size,16);
  assert.equal(new Set(shadeEntries.map(s=>s[1])).size,12);
  assert.equal(new Set(shadeEntries.map(s=>s[2])).size,12);
  for(const family of [...manicureEntries,...pediEntries]){
    assert.ok(family[2].length>=4&&family[3].length>=4,family[1]);
    assert.ok(family[4].length>=8,family[1]);
  }
  assert.ok(expansion.includes('serviceId:family.finish'));
});
