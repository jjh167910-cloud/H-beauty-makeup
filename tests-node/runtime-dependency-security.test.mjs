import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pkg=JSON.parse(readFileSync(new URL("../package.json",import.meta.url),"utf8"));
const lock=JSON.parse(readFileSync(new URL("../package-lock.json",import.meta.url),"utf8"));

function atLeast(v,min){
  const parts=v.split(".").map(Number);
  const floor=min.split(".").map(Number);
  for(let i=0;i<3;i++){
    if((parts[i]??0)>(floor[i]??0))return true;
    if((parts[i]??0)<(floor[i]??0))return false;
  }
  return true;
}

test("unused authentication server package is absent from the deployed web app",()=>{
  assert.equal(pkg.dependencies["better-auth"],undefined);
  assert.equal(lock.packages["node_modules/better-auth"],undefined);
});

test("resolved runtime validation and serializer versions meet security patch floors",()=>{
  const zod=lock.packages["node_modules/zod"]?.version;
  const seroval=lock.packages["node_modules/seroval"]?.version;
  assert.ok(zod && atLeast(zod,"4.6.6"),`Zod security floor not met: ${zod}`);
  assert.ok(seroval && atLeast(seroval,"1.6.11"),`Seroval security floor not met: ${seroval}`);
});
