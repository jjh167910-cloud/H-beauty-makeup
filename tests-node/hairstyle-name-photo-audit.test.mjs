import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const families=JSON.parse(readFileSync(new URL("../src/data/catalog.json",import.meta.url),"utf8"));
const items=families.flatMap(f=>f.variantIds.map((id,i)=>({
  id,
  name:f.variantNames[i],
  category:f.category,
  tags:f.tags,
  code:f.code
})));
const byId=new Map(items.map(item=>[item.id,item]));

test("all 292 catalog photo IDs have one unique, nonempty label",()=>{
  assert.equal(items.length,292);
  assert.equal(byId.size,292);
  for(let id=1;id<=292;id++){
    const item=byId.get(id);
    assert.ok(item,"Missing hairstyle "+id);
    assert.equal(typeof item.name,"string");
    assert.ok(item.name.trim().length>3);
    assert.ok(item.category);
    assert.ok(item.tags.includes(item.category));
  }
});

test("visual-review corrections remain associated with their exact IDs",()=>{
  assert.deepEqual(
    [byId.get(1).name,byId.get(1).category],
    ["موی بلند موج‌دار شکلاتی با چتری سبک","waves"]
  );
  for(const id of [23,291]){
    assert.equal(byId.get(id).category,"straight","Straight hairstyle "+id+" wrongly categorized");
    assert.ok(byId.get(id).name.includes("صاف"));
  }
  assert.equal(byId.get(40).name,"موی بلند موج‌دار با چتری نرم");
  assert.equal(byId.get(41).name,"موی بلند صاف با چتری سبک");
});
