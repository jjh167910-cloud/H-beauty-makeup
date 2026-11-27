"""Public-only glitter texture comparison; no private photos or production assets."""
import json
import sys
from pathlib import Path
import cv2
import numpy as np
from score import Face, mean_lab, de, lstar
from make_set import truth
import teacher as T

def metrics(im, region, ew):
    y=lstar(im)
    high=y-cv2.GaussianBlur(y,(0,0),max(.8,ew*.025))
    m=region>.5
    if m.sum()<100: raise RuntimeError("Insufficient eyelid samples")
    positive=high[m]
    return dict(peak_p95=float(np.percentile(positive,95)),
                peak_p99=float(np.percentile(positive,99)),
                bright_fraction=float(np.mean(positive>3)),
                dark_fraction=float(np.mean(positive<-3)),
                clipped_fraction=float(np.mean(np.max(im[m],axis=-1)>=254)))

def main(root):
    manifest=json.loads((root/"manifest.json").read_text())
    bare=T.rgb(root/"bare.png")
    f=Face(bare,np.asarray(manifest["points"],np.float32))
    region=cv2.erode((f.lids>.5).astype(np.uint8),np.ones((3,3),np.uint8))*(1-f.strands(bare))
    original=T.rgb(T.LOOKS/"no-makeup.webp")
    target=truth("glitter-party",original,T.eye_width(T.landmarks3(original)))
    target=cv2.resize(target,(bare.shape[1],bare.shape[0]),interpolation=cv2.INTER_AREA)
    ref=metrics(target,region,f.ew)
    rows={}
    for finish in ("glitter","matte","shimmer"):
        group=[x for x in manifest["rows"] if x["finish"]==finish]
        if len(group)!=2: raise RuntimeError("Incomplete paired render")
        a=T.rgb(root/next(x["file"] for x in group if not x["pilot"]))
        b=T.rgb(root/next(x["file"] for x in group if x["pilot"]))
        if a.shape!=bare.shape or b.shape!=a.shape: raise RuntimeError("Geometry changed")
        diff=np.max(np.abs(a.astype(np.int16)-b.astype(np.int16)),axis=-1)
        protected=(f.face<.5)|(f.lips>.5)|(f.balls>.5)
        old,new=metrics(a,region,f.ew),metrics(b,region,f.ew)
        rows[finish]=dict(before=old,after=new,changed=int(np.count_nonzero(diff)),
                          protected_changed=int(np.count_nonzero(diff[protected])),
                          protected_max=int(diff[protected].max()),
                          eye_changed=int(np.count_nonzero(diff[f.balls>.5])),
                          lip_changed=int(np.count_nonzero(diff[f.lips>.5])),
                          exterior_changed=int(np.count_nonzero(diff[f.face<.5])),
                          cheek_de00=de(mean_lab(a,f.cheeks),mean_lab(b,f.cheeks)),
                          lid_de00=de(mean_lab(a,region),mean_lab(b,region)))
    g=rows["glitter"]
    improvement=abs(g["before"]["peak_p99"]-ref["peak_p99"])-abs(g["after"]["peak_p99"]-ref["peak_p99"])
    accepted=bool(improvement>.1 and g["changed"]>0 and g["protected_changed"]==0
             and g["after"]["clipped_fraction"]<=g["before"]["clipped_fraction"]
             and g["lid_de00"]<=.5
             and all(rows[x]["changed"]==0 for x in ("matte","shimmer")))
    report=dict(scope="public catalog only",reference=ref,rows=rows,
                p99_reference_error_reduction=improvement,candidate_accepted=accepted,
                limitation="Bright high-pass tails are a sparkle proxy, not proof of realistic glitter; artist review required.")
    (root/"report.json").write_text(json.dumps(report,indent=2))
    print("GLITTER_CALIBRATION "+json.dumps(report),flush=True)
    if not accepted:
        raise RuntimeError("Integrated glitter candidate failed acceptance; see saved report")

if __name__=="__main__":
    main(Path(sys.argv[1]))
