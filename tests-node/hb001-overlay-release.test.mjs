import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("HB-001 release refuses missing required image lock",()=>{
  const isolated=mkdtempSync(join(tmpdir(),"hb001-lock-test-"));
  try {
  const result=spawnSync(process.execPath,[resolve("scripts/apply-hb001-overlay.mjs")],{
    encoding:"utf8",cwd:isolated,env:{...process.env,HB001_OVERLAY_REQUIRED:"true"}
  });
  assert.notEqual(result.status,0,"release must not silently retain stale HB-001");
  assert.match(result.stderr,/Required HB-001 release overlay lock missing/);
  } finally {rmSync(isolated,{recursive:true,force:true});}
});
