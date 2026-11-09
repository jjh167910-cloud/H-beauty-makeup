import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

test("owner explicitly authorized exactly 146 source-original temporary displays but not professional image QC certification",()=>{
 const grant=JSON.parse(readFileSync("docs/HBEAUTY_OWNER_TEMPORARY_146_DISPLAY_20261031.json","utf8"));
 assert.equal(grant.status,"OWNER_AUTHORIZED_TEMPORARY_CUSTOMER_DISPLAY");
 assert.equal(grant.expected_count,146);
 assert.equal(grant.mode,"temporary_override_visual_display_only");
 assert.equal(grant.editorial_qc_status,"NOT_CERTIFIED");
 assert.equal(grant.prior_triage.rejected,16);
 assert.equal(grant.prior_triage.hold,16);
 assert.equal(grant.prior_triage.new_unreviewed,86);
 const queue=JSON.parse(readFileSync("docs/HBEAUTY_MANICURE_162_QUEUE.json","utf8"));
 const pending=queue.batches.flatMap(b=>b.styles).filter(x=>x.qa_status==="NOT_GENERATED");
 assert.equal(pending.length,146);
 assert.ok(pending.every(x=>x.approved_by_qa===false&&x.sha256===null));
});

test("owner-selected source paths and customer gallery are independently mapped without rewriting editorial approvals",()=>{
 const src=readFileSync("src/components/salon/nail-visual.tsx","utf8");
 const screen=readFileSync("src/components/salon/screens/nails.tsx","utf8");
 const build=readFileSync("scripts/build-salon.mjs","utf8");
 assert.match(src,/OWNER_SELECTED_TEMPORARY_MANICURE_PHOTOS/);
 assert.match(src,/NAIL_CUSTOMER_PHOTOS/);
 assert.match(src,/\/review\/photos\//);
 assert.match(screen,/NAIL_CUSTOMER_PHOTOS\[style\.id\]/);
 assert.match(build,/VITE_MANICURE_OWNER_VISIBLE_IDS:ownerSelectedManicure\.join/);
 assert.doesNotMatch(build,/approved_by_qa\s*:\s*true/);
});
