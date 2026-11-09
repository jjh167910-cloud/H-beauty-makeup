import test from "node:test";
import assert from "node:assert/strict";
import {inspectPanelGrid} from "../scripts/detect-nail-contact-sheet.mjs";

test("conservative screen flags repeated six-column, three-row beauty look boards",()=>{
  // Real contact sheets use several evenly spaced light-neutral gutters.
  const r=inspectPanelGrid({
    width:1536,height:1024,
    vertical:[417,418,605,795,974,975,1162,1163,1359],
    horizontal:[352,684,685,686,692]
  });
  assert.equal(r.likelyContactSheet,true);
  assert.ok(r.regularVerticalCount>=4);
  assert.ok(r.verticalSeams>=5);
});

test("one photographic background stripe or two bright edges are not a grid",()=>{
  const r=inspectPanelGrid({
    width:1024,height:1024,vertical:[260,760],horizontal:[700]
  });
  assert.equal(r.likelyContactSheet,false);
});

test("wide pale photographic backgrounds are not counted as dozens of gutters",()=>{
  const r=inspectPanelGrid({
    width:1024,height:1024,
    vertical:Array.from({length:800},(_,i)=>100+i),
    horizontal:Array.from({length:700},(_,i)=>150+i)
  });
  assert.equal(r.likelyContactSheet,false);
  assert.equal(r.verticalSeams,0);
  assert.equal(r.horizontalSeams,0);
});

test("irregular, unrelated objects do not produce a regular grid",()=>{
  const r=inspectPanelGrid({
    width:1536,height:1024,
    vertical:[201,352,569,882,1201],
    horizontal:[340,699]
  });
  assert.equal(r.likelyContactSheet,false);
});

test("five aligned columns plus a full-width central divider are suspicious",()=>{
  const r=inspectPanelGrid({
    width:1200,height:900,
    vertical:[200,400,600,800,1000],
    horizontal:[455]
  });
  assert.equal(r.likelyContactSheet,true);
});

test("seam scanner rejects invalid input",()=>{
  assert.throws(()=>inspectPanelGrid({width:0,height:600,vertical:[],horizontal:[]}),/Invalid separator scan/);
});
