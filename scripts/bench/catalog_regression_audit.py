"""Fixed-input public catalog audit of the lower-lash change and later versions."""
import json
import sys
from pathlib import Path
import cv2
import numpy as np
from score import Face, de
from make_set import truth, shrink
import teacher as T

LOOKS = ["electric-blue","glitter-party","full-glam","navy-smokey","bold-glam","cut-crease","monochrome","sunset","fiery-red","classic-bride"]
def save(path, im):
    if not cv2.imwrite(str(path),cv2.cvtColor(im,cv2.COLOR_RGB2BGR)):
        raise RuntimeError("Could not write "+str(path))

def prepare(root):
    root.mkdir(parents=True,exist_ok=True)
    bare,_=T._bare()
    p=T.landmarks3(bare)
    if p is None: raise RuntimeError("Missing catalog landmarks")
    ew=T.eye_width(p[:,:2])
    save(root/"input.png",shrink(bare))
    for look in LOOKS:
        save(root/(look+"-truth.png"),shrink(truth(look,bare,ew)))
    (root/"looks.json").write_text(json.dumps(LOOKS))

def score(root):
    reports={}
    for version in ("before","after","current"):
        sub=root/version
        m=json.loads((sub/"manifest.json").read_text())
        if sorted(m["looks"])!=sorted(LOOKS) or m["engine"]!="gpu":
            raise RuntimeError("Incomplete GPU render: "+version)
        bare=T.rgb(sub/"bare.png")
        f=Face(bare,np.asarray(m["points"],np.float32))
        rows={}
        for look in LOOKS:
            im=T.rgb(sub/(look+".png"))
            target=T.rgb(root/(look+"-truth.png"))
            if im.shape!=bare.shape: raise RuntimeError("Geometry changed")
            if target.shape!=bare.shape:
                target=cv2.resize(target,(bare.shape[1],bare.shape[0]),interpolation=cv2.INTER_AREA)
            a,b=f.colours(im),f.colours(target)
            metrics={k:de(a[k],b[k]) for k in ("lid","lowlash","lip","cheek","water")}
            if any(metrics[k] is None or not np.isfinite(metrics[k]) for k in ("lid","lowlash","lip","cheek")):
                raise RuntimeError("Missing metric: "+look)
            protected=(f.outside>.5)
            delta=np.max(np.abs(im.astype(np.int16)-bare.astype(np.int16)),axis=-1)
            metrics["outside_changed"]=int(np.count_nonzero(delta[protected]))
            metrics["new_clipped"]=int(np.count_nonzero((f.face>.5)&(np.max(im,axis=-1)>=254)&(np.max(bare,axis=-1)<254)))
            rows[look]=metrics
        reports[version]=rows
    deltas=[]
    for look in LOOKS:
        for region in ("lid","lowlash"):
            b,a,c=(reports[v][look][region] for v in ("before","after","current"))
            deltas.append(dict(look=look,region=region,before=b,after=a,current=c,
                               lash_change=a-b,current_vs_before=c-b,
                               regression_remaining=c-b>.05))
    report=dict(scope="public catalog, original light, v2 only",versions=reports,comparisons=deltas,
                note="Recomputed on identical inputs; not necessarily numerically identical to historical reports.")
    (root/"report.json").write_text(json.dumps(report,indent=2))
    print("CATALOG_REGRESSION_AUDIT "+json.dumps(report),flush=True)

if __name__=="__main__":
    {"prepare":prepare,"score":score}[sys.argv[1]](Path(sys.argv[2]))
