"""Evaluate liner pigment and brush softness against aligned public photographs."""
import json,sys
from pathlib import Path
import cv2
import numpy as np
from score import Face,UPPER_R,UPPER_L,de_map,lstar,mean_lab,de
from make_set import truth
import teacher as T

LOOKS=("romantic-bride","nineties")
MODES=("baseline","brown-pencil","black-pencil","brown-pen","soft-taupe")

def main(root):
    m=json.loads((root/"manifest.json").read_text())
    bare=T.rgb(root/"bare.png")
    f=Face(bare,np.asarray(m["points"],np.float32))
    original=T.rgb(T.LOOKS/"no-makeup.webp")
    ew=T.eye_width(T.landmarks3(original)[:,:2])
    # Fixed upper-lash support, independent of each candidate's darkness.
    rim=np.zeros(bare.shape[:2],np.uint8)
    for ids in (UPPER_R,UPPER_L):
        cv2.polylines(rim,[np.int32(np.round(f.p[ids]))],False,1,max(3,round(f.ew*.12)))
    rim=(rim>0)&(f.balls<.5)&(f.face>.5)
    if rim.sum()<100: raise RuntimeError("Missing liner measurement support")
    protected=(f.balls>.5)|(f.lips>.5)|(f.face<.5)
    rows=[]
    for look in LOOKS:
        group=[r for r in m["rows"] if r["id"]==look]
        if sorted(r["mode"] for r in group)!=sorted(MODES): raise RuntimeError("Incomplete sweep")
        target=truth(look,original,ew)
        target=cv2.resize(target,(bare.shape[1],bare.shape[0]),interpolation=cv2.INTER_AREA)
        base=T.rgb(root/(look+"-baseline.png"))
        if base.shape!=bare.shape: raise RuntimeError("Geometry changed")
        def error(im):
            return float(de_map(im,target,max(1.,f.ew*.012))[rim].mean())
        before=error(base)
        for row in group:
            im=T.rgb(root/row["file"])
            if im.shape!=base.shape: raise RuntimeError("Geometry changed")
            diff=np.max(np.abs(im.astype(np.int16)-base.astype(np.int16)),axis=-1)
            after=error(im)
            if not np.isfinite([before,after]).all(): raise RuntimeError("Nonfinite liner score")
            pc=int(np.count_nonzero(diff[protected]))
            cheek=de(mean_lab(im,f.cheeks),mean_lab(base,f.cheeks))
            if cheek is None or not np.isfinite(cheek): raise RuntimeError("Missing cheek control")
            clip=int(np.count_nonzero((np.max(im,axis=-1)>=254)&(np.max(base,axis=-1)<254)))
            rows.append(dict(look=look,mode=row["mode"],before=before,after=after,
                changed=int(np.count_nonzero(diff)),protected_changed=pc,
                cheek_de00=cheek,new_clipped=clip,
                candidate_accepted=bool(row["mode"]!="baseline" and after<before-.05 and pc==0 and cheek<=.05 and clip==0)))
    selections={}
    for look in LOOKS:
        ok=[r for r in rows if r["look"]==look and r["candidate_accepted"]]
        selections[look]=min(ok,key=lambda r:r["after"])["mode"] if ok else "baseline"
    report=dict(scope="public catalog only",metric="spatial CIEDE2000 on fixed upper-lash rim",rows=rows,selections=selections)
    (root/"report.json").write_text(json.dumps(report,indent=2))
    print("SOFT_LINER_CALIBRATION "+json.dumps(report),flush=True)

if __name__=="__main__":main(Path(sys.argv[1]))
