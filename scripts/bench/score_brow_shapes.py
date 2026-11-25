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
        if len(pair)!=2: raise RuntimeError("Incomplete pair")
        a=T.rgb(root/next(x["file"] for x in pair if not x["pilot"]))
        b=T.rgb(root/next(x["file"] for x in pair if x["pilot"]))
        if a.shape!=bare.shape or b.shape!=bare.shape: raise RuntimeError("Geometry changed")
        target=truth(look,original,ew)
        target=cv2.resize(target,(bare.shape[1],bare.shape[0]),interpolation=cv2.INTER_AREA)
        scores=[float(de_map(im,target,max(1.,f.ew*.05))[mask].mean()) for im in (a,b)]
        diff=np.max(np.abs(a.astype(np.int16)-b.astype(np.int16)),axis=-1)
        protected=(f.balls>.5)|(f.lips>.5)|(f.outside>.5)
        row=dict(look=look,before=scores[0],after=scores[1],changed=int(np.count_nonzero(diff)),
                 protected_changed=int(np.count_nonzero(diff[protected])))
        row["candidate_accepted"]=bool(look in ("k-beauty","hollywood") and row["changed"]>0 and
            row["protected_changed"]==0 and scores[1]<scores[0]-.05)
        rows.append(row)
    report=dict(scope="public original-light catalog only",rows=rows)
    (root/"report.json").write_text(json.dumps(report,indent=2))
    print("BROW_SHAPES_CALIBRATION "+json.dumps(report),flush=True)
    if any(x["changed"] for x in rows if x["look"] in ("soft-glam","nineties")):
        raise RuntimeError("Control look changed")

if __name__=="__main__":
    main(Path(sys.argv[1]))
