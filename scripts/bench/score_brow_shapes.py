"""Score public-only brow shape candidates with the existing benchmark brow mask."""
import json, sys
from pathlib import Path
import cv2
import numpy as np
from score import Face, de_map
from make_set import truth
import teacher as T

def main(root):
    manifest=json.loads((root/"manifest.json").read_text())
    bare=T.rgb(root/"bare.png")
    f=Face(bare,np.asarray(manifest["points"],np.float32))
    original=T.rgb(T.LOOKS/"no-makeup.webp")
    ew=T.eye_width(T.landmarks3(original)[:,:2])
    mask=f.browzone>.5
    if mask.sum()<50: raise RuntimeError("Missing brow region")
    rows=[]
    for look in ("k-beauty","hollywood","soft-glam","nineties"):
        pair=[x for x in manifest["rows"] if x["id"]==look]
        if len(pair)!=(4 if look=="hollywood" else 2): raise RuntimeError("Incomplete comparison")
        baseline=[x for x in pair if not x["pilot"]]
        if len(baseline)!=1: raise RuntimeError("Invalid baseline")
        a=T.rgb(root/baseline[0]["file"])
        target=truth(look,original,ew)
        target=cv2.resize(target,(bare.shape[1],bare.shape[0]),interpolation=cv2.INTER_AREA)
        if a.shape!=bare.shape: raise RuntimeError("Geometry changed")
        before=float(de_map(a,target,max(1.,f.ew*.05))[mask].mean())
        protected=(f.balls>.5)|(f.lips>.5)|(f.outside>.5)
        for candidate in (x for x in pair if x["pilot"]):
            b=T.rgb(root/candidate["file"])
            if b.shape!=bare.shape: raise RuntimeError("Geometry changed")
            after=float(de_map(b,target,max(1.,f.ew*.05))[mask].mean())
            if not np.isfinite([before,after]).all(): raise RuntimeError("Nonfinite metric")
            diff=np.max(np.abs(a.astype(np.int16)-b.astype(np.int16)),axis=-1)
            row=dict(look=look,place=candidate["place"],before=before,after=after,changed=int(np.count_nonzero(diff)),
                     protected_changed=int(np.count_nonzero(diff[protected])))
            row["candidate_accepted"]=bool(look in ("k-beauty","hollywood") and row["changed"]>0 and
                row["protected_changed"]==0 and after<before-.05)
            rows.append(row)
    report=dict(scope="public original-light catalog only",rows=rows)
    (root/"report.json").write_text(json.dumps(report,indent=2))
    print("BROW_SHAPES_CALIBRATION "+json.dumps(report),flush=True)
    if any(x["changed"] for x in rows if x["look"] in ("soft-glam","nineties")):
        raise RuntimeError("Control look changed")
    for look,place in (("k-beauty","straight"),("hollywood","sculptedSoft")):
        selected=[r for r in rows if r["look"]==look and r["place"]==place]
        if len(selected)!=1 or selected[0]["candidate_accepted"] is not True:
            raise RuntimeError("Integrated brow candidate rejected: "+look+" / "+place)

if __name__=="__main__":
    main(Path(sys.argv[1]))
