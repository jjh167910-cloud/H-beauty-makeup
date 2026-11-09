import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { finalizeServiceWorker } from "../scripts/finalize-service-worker.mjs";

function shell(fn) {
  const root=mkdtempSync(join(tmpdir(),"hananeh-nail-"));
  try {
    mkdirSync(join(root,"assets"),{recursive:true});
    mkdirSync(join(root,"nails","photos"),{recursive:true});
    writeFileSync(join(root,"index.html"),'<html><div id="root"></div></html>');
    writeFileSync(join(root,"assets","entry.js"),'// fake app');
    writeFileSync(join(root,"assets","entry.css"),'/* fake style */');
    writeFileSync(join(root,"sw.js"),
      "const CACHE='h-beauty-v5-unbuilt';\nconst BUILD_ASSETS=[]; /* __H_BEAUTY_PRECACHE__ */\n");
    return fn(root);
  } finally { rmSync(root,{recursive:true,force:true}); }
}

test("missing optional nail pack keeps release build usable",()=>{
  shell(root=>{
    const result=finalizeServiceWorker(root);
    assert.equal(result.urls.some(url=>url.startsWith("/nails/photos/")),false);
  });
});

test("partially installed nail photo pack fails instead of publishing broken cards",()=>{
  shell(root=>{
    writeFileSync(join(root,"nails","photos","nail-milky-silk.webp"),Buffer.alloc(43_100));
    assert.throws(()=>finalizeServiceWorker(root),/Nail photo pack incomplete/);
  });
});
