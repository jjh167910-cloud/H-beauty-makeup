"""Select lower-lash ablations using fixed public catalog targets; never promote automatically."""
import json,sys
from pathlib import Path
import cv2
import numpy as np
from score import Face,de
import teacher as T
from catalog_regression_audit import LOOKS

IDS=LOOKS[:7]
MODES=("baseline","half-mascara","no-mascara","no-extra-shadow","half-no-extra-shadow")
def main(root):
    manifest=json.loads((root/"lash-manifest.json").read_text())
    bare=T.rgb(root/"bare.png")
    f=Face(bare,np.asarray(manifest["points"],np.float32))
    protected=(f.balls>.5)|(f.lips>.5)|(f.outside>.5)
    rows=[]
    for look in IDS:
        group=[r for r in manifest["rows"] if r["id"]==look]
        if sorted(r["mode"] for r in group)!=sorted(MODES):
            raise RuntimeError("Incomplete ablation: "+look)
        target=T.rgb(root/(look+"-truth.png"))
        if target.shape!=bare.shape:
            target=cv2.resize(target,(bare.shape[1],bare.shape[0]),interpolation=cv2.INTER_AREA)
        tc=f.colours(target)
        base=T.rgb(root/(look+"-baseline.png"))
        bc=f.colours(base)
        errors={k:de(bc[k],tc[k]) for k in ("lid","lowlash","lip","cheek","water")}
        for row in group:
            im=T.rgb(root/row["file"])
            if im.shape!=base.shape: raise RuntimeError("Changed geometry")
            c=f.colours(im)
            e={k:de(c[k],tc[k]) for k in errors}
            if any(e[k] is None or errors[k] is None or not np.isfinite([e[k],errors[k]]).all() for k in ("lid","lowlash","lip","cheek")):
                raise RuntimeError("Nonfinite regional metric")
            diff=np.max(np.abs(im.astype(np.int16)-base.astype(np.int16)),axis=-1)
            changed=int(np.count_nonzero(diff[protected]))
            accept=bool(row["mode"]!="baseline" and e["lowlash"]<errors["lowlash"]-.05 and
                        all(e[k]<=errors[k]+.05 for k in ("lid","lip","cheek")) and changed==0)
            rows.append(dict(look=look,mode=row["mode"],baseline=errors,errors=e,protected_changed=changed,
                             candidate_accepted=accept))
    selections={}
    for look in IDS:
        eligible=[r for r in rows if r["look"]==look and r["candidate_accepted"]]
        selections[look]=min(eligible,key=lambda x:x["errors"]["lowlash"])["mode"] if eligible else "baseline"
    report=dict(scope="public catalog only",rows=rows,selections=selections)
    (root/"lash-report.json").write_text(json.dumps(report,indent=2))
    print("LOWER_LASH_CALIBRATION "+json.dumps(report),flush=True)
if __name__=="__main__":main(Path(sys.argv[1]))
