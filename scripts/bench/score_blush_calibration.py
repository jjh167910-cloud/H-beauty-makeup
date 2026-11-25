"""Score opt-in public GPU blush sweep with the established cheek ΔE00 metric."""
import json
import sys
from pathlib import Path
import cv2
import numpy as np
from score import Face, mean_lab, de
from make_set import truth
import teacher as T

def main(root):
    manifest=json.loads((root/"manifest.json").read_text())
    bare=T.rgb(root/"bare.png")
    p=np.asarray(manifest["points"],np.float32)
    f=Face(bare,p)
    if f.cheeks.sum()<100: raise RuntimeError("Missing cheek regions")
    results=[]
    for look in ("pin-up","golden-hour"):
        original=T.rgb(T.LOOKS/"no-makeup.webp")
        raw=truth(look,original,T.eye_width(T.landmarks3(original)))
        target=cv2.resize(raw,(bare.shape[1],bare.shape[0]),interpolation=cv2.INTER_AREA)
        wanted=mean_lab(target,f.cheeks)
        rows=[x for x in manifest["rows"] if x["id"]==look]
        if len(rows)<3 or rows[0]["amount"]!=rows[0]["base"]: raise RuntimeError("Incomplete sweep")
        baseline=T.rgb(root/rows[0]["file"])
        if baseline.shape!=bare.shape: raise RuntimeError("Unexpected output geometry")
        # Blush is a cheek product; require exact lip and eye-opening pixels.
        protected=(f.lips>.5)|(f.balls>.5)|(f.face<.5)
        for row in rows:
            im=T.rgb(root/row["file"])
            if im.shape!=baseline.shape: raise RuntimeError("Output geometry changed")
            diff=np.max(np.abs(im.astype(np.int16)-baseline.astype(np.int16)),axis=-1)
            error=de(mean_lab(im,f.cheeks),wanted)
            if error is None or not np.isfinite(error): raise RuntimeError("No finite cheek color")
            results.append(dict(look=look,amount=row["amount"],baseline=row["amount"]==row["base"],
                cheek_de00=error,protected_changed=int(np.count_nonzero(diff[protected])),
                protected_max=int(diff[protected].max())))
    selections=[]
    for look in ("pin-up","golden-hour"):
        group=[r for r in results if r["look"]==look]
        baseline=next(r for r in group if r["baseline"])
        accepted=[r for r in group if not r["baseline"] and r["protected_changed"]==0 and r["cheek_de00"]<baseline["cheek_de00"]-.05]
        selected=min(accepted,key=lambda x:x["cheek_de00"]) if accepted else baseline
        selections.append(dict(look=look,before=baseline["cheek_de00"],after=selected["cheek_de00"],selected_amount=selected["amount"],candidate_accepted=bool(accepted)))
    report=dict(scope="public catalog only",metric="CIEDE2000 on existing cheek mask",results=results,selections=selections)
    (root/"report.json").write_text(json.dumps(report,indent=2))
    print("BLUSH_CALIBRATION",json.dumps(report),flush=True)

if __name__=="__main__":
    main(Path(sys.argv[1]))
