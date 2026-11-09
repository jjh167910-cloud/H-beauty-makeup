import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function simulateWorker({online=true}={}){
  const handlers={};
  const current=new Map(),previous=new Map();
  let onlineCalls=0;
  const origin="https://h-beauty.test";
  const key=req=>typeof req==="string"?req:req.url;
  const response=(name)=>({
    ok:true,type:"basic",status:200,version:name,
    clone(){return response(name);}
  });
  const context={
    self:{
      location:{origin},
      addEventListener(name,callback){handlers[name]=callback;}
    },
    caches:{
      async open(){return {
        async match(req){return current.get(key(req));},
        async put(req,res){current.set(key(req),res);}
      };},
      async match(req){return previous.get(key(req));}
    },
    async fetch(){
      onlineCalls++;
      if(!online)throw Error("offline");
      return response("new-portrait");
    },
    URL,Set,console,Promise
  };
  vm.runInNewContext(readFileSync(new URL("../public/sw.js",import.meta.url),"utf8"),context);
  async function request(path){
    let pending;
    handlers.fetch({
      request:{method:"GET",mode:"no-cors",url:origin+path},
      respondWith(prom){pending=prom;}
    });
    assert.ok(pending,"SW must handle same-origin GET");
    return pending;
  }
  return {request,current,previous,response,origin,onlineCalls:()=>onlineCalls};
}

test("a new hairstyle release fetches new photo bytes before checking the older cache",async()=>{
  const sw=simulateWorker({online:true});
  const url=sw.origin+"/looks/sm/84.webp";
  sw.previous.set(url,sw.response("stale-portrait"));
  const first=await sw.request("/looks/sm/84.webp");
  assert.equal(first.version,"new-portrait");
  assert.equal(sw.current.get(url).version,"new-portrait");
  assert.equal(sw.onlineCalls(),1);
  const repeat=await sw.request("/looks/sm/84.webp");
  assert.equal(repeat.version,"new-portrait");
  assert.equal(sw.onlineCalls(),1);
});

test("an offline hairstyle can fall back to the immediately previous release",async()=>{
  const sw=simulateWorker({online:false});
  const url=sw.origin+"/looks/84.webp";
  sw.previous.set(url,sw.response("saved-offline-portrait"));
  const item=await sw.request("/looks/84.webp");
  assert.equal(item.version,"saved-offline-portrait");
  assert.equal(sw.onlineCalls(),1);
});
