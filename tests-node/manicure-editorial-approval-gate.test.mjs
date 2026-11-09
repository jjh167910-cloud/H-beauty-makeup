import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {verifyManicureEditorialApprovals} from "../scripts/verify-manicure-editorial-approvals.mjs";

test("unapproved dynamic manicure photo cannot enter production",()=>{
  const dir=mkdtempSync(join(tmpdir(),"hb-qa-"));
  try {
    mkdirSync(join(dir,"docs"));mkdirSync(join(dir,"assets"));
    const id="nail-rose-chrome",hash="a".repeat(64),group="hbeauty-manicure-batch61";
    const image={id,hash,group,path:"public/nails/photos/"+id+".webp"};
    const style={id,finish:"chrome",shape:"coffin",length:"long",base:"#BB849B",accent:"#F6C4D5",qa_status:"APPROVED",approved_by_qa:true,sha256:hash};
    writeFileSync(join(dir,"docs","HBEAUTY_MANICURE_162_QUEUE.json"),
      JSON.stringify({batches:[{styles:[style]}]}));
    assert.deepEqual(verifyManicureEditorialApprovals([],{root:dir}),{approved:0,batches:0});
    assert.throws(()=>verifyManicureEditorialApprovals([image],{root:dir}),/record missing/);
    const row={id,sha256:hash,filename:image.path,
      anatomy_five_fingers:"PASS",nail_detail_and_cuticles:"PASS",
      pure_ivory_silk_no_stone:"PASS",exact_catalog_style:"PASS",
      no_duplicate_or_collage:"PASS",original_native_resolution:"PASS",
      reviewed_full_resolution:true,
      finish:style.finish,shape:style.shape,length:style.length,
      base:style.base,accent:style.accent,
      review_notes:"Native image inspected: five fingers, real cuticles, correct rose chrome coffin nails and pure ivory silk."};
    const approval={schema:1,batch:group,decision:"APPROVED_FOR_PUBLICATION",
      reviewer:"visual-qa-reviewer",reviewed_at:"2026-10-30T10:00:00Z",images:[row]};
    const out=join(dir,"assets",group+".qa.json");
    const save=()=>writeFileSync(out,JSON.stringify(approval));
    save();
    assert.deepEqual(verifyManicureEditorialApprovals([image],{root:dir}),{approved:1,batches:1});
    row.pure_ivory_silk_no_stone="FAIL";save();
    assert.throws(()=>verifyManicureEditorialApprovals([image],{root:dir}),/review incomplete/);
    row.pure_ivory_silk_no_stone="PASS";row.shape="almond";save();
    assert.throws(()=>verifyManicureEditorialApprovals([image],{root:dir}),/metadata mismatch/);
    row.shape="coffin";row.sha256="b".repeat(64);save();
    assert.throws(()=>verifyManicureEditorialApprovals([image],{root:dir}),/identity mismatch/);
    row.sha256=hash;approval.decision="REJECTED";save();
    assert.throws(()=>verifyManicureEditorialApprovals([image],{root:dir}),/approval incomplete/);
    approval.decision="APPROVED_FOR_PUBLICATION";save();
    assert.throws(()=>verifyManicureEditorialApprovals([{...image,hash:"b".repeat(64)}],{root:dir}),/queue has not authorized/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
