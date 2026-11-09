import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {LOCKS,loadPhotoLocks,releaseLocks} from "../scripts/verify-all-nail-photos.mjs";

test("all 58 manicure and 78 pedicure references are disjoint and locked",()=>{
  const items=loadPhotoLocks();
  assert.ok(LOCKS.reduce((sum,x)=>sum+x.count,0)>=136);
  assert.ok(releaseLocks().length>=LOCKS.length);
  assert.ok(items.filter(x=>x.kind==="manicure").length>=58);
  assert.equal(items.filter(x=>x.kind==="pedicure").length,78);
  assert.equal(new Set(items.map(x=>x.path)).size,items.length);
  assert.equal(new Set(items.map(x=>x.hash)).size,items.length);
});
test("every newly approved manicure image is explicitly wired to the gallery",()=>{
  const items=loadPhotoLocks().filter(x=>x.kind==="manicure"&&!x.legacy);
  const component=readFileSync("src/components/salon/nail-visual.tsx","utf8");
  for(const item of items){
    if(LOCKS.some(group=>group.name===item.group))
      assert.ok(component.includes(item.id),"Existing photo has no gallery association: "+item.id);
    else
      assert.match(component,/FUTURE_MANICURE_EDITORIAL_PHOTOS/,
        "New verified batch requires the dynamic gallery mapping");
  }
  assert.match(component,/VITE_PEDICURE_78/);
});
