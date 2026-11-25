"""Opt-in public-catalog research: isolate bare-face crease/lash lightening halos.

This does not export production assets or modify the renderer. In the aligned
log-ratio layer, a dark bare lash shifted by the edited reference can leave a
bright streak. Suppress only locally positive achromatic high-frequency
residuals supported by a dark ridge in the bare photo. New dark ink, chroma,
and everything outside the upper-eye mask remain unchanged.
"""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path
import cv2
import numpy as np

def suppress(layer, bare_lum, target_lum, support, ew):
    """Return candidate, correction. Inputs are aligned linear-light luminances."""
    if layer.ndim != 3 or layer.shape[-1] != 3 or any(
        x.shape != layer.shape[:2] for x in (bare_lum, target_lum, support)
    ):
        raise ValueError("incompatible eye residual inputs")
    if not np.isfinite(ew) or ew < 4:
        raise ValueError(f"invalid eye width: {ew}")
    for name, arr in (("layer", layer), ("bare_lum", bare_lum),
                      ("target_lum", target_lum), ("support", support)):
        if not np.isfinite(arr).all():
            raise ValueError(f"nonfinite {name}")
    if np.any(bare_lum < 0) or np.any(target_lum < 0):
        raise ValueError("negative linear-light luminance")
    if np.any((support < -1e-6) | (support > 1+1e-6)):
        raise ValueError(f"invalid support range: {support.min()} to {support.max()}")
    # OpenCV float32 Gaussian convolution can overshoot unity by a few ULPs.
    # Clamp only that numerical roundoff, never material invalid mask values.
    support = np.clip(support, 0, 1)
    # A local darkness ratio is exposure-invariant. Only the *bare* ridge is
    # evidence for source identity detail, never a new dark target line alone.
    sigma = max(1.0, ew * 0.035)
    blur = lambda x: cv2.GaussianBlur(x.astype(np.float32), (0, 0), sigma)
    smoothstep = lambda a,b,x: (lambda t: t*t*(3-2*t))(np.clip((x-a)/(b-a),0,1))
    bare_dark = np.maximum(0, np.log((blur(bare_lum)+.004)/(bare_lum+.004)))
    target_dark = np.maximum(0, np.log((blur(target_lum)+.004)/(target_lum+.004)))
    # Do not subtract new dark lines, or high-frequency darkening in the layer.
    confidence = smoothstep(.12,.35,bare_dark) * (1-smoothstep(.12,.35,target_dark))
    mean = layer.mean(axis=2)
    local = blur(mean)
    positive = np.maximum(0, np.minimum(mean, mean-local))
    correction = (np.minimum(positive,.18) * confidence * support).astype(np.float32)
    candidate = layer.copy()
    changed = correction > 0
    candidate[changed] -= correction[changed,None]
    return candidate, correction

def self_test():
    h,w=96,128
    mask=np.zeros((h,w),np.float32); mask[20:70,20:110]=1
    bare=np.full((h,w),.45,np.float32); bare[35,25:105]=.09
    target=np.full_like(bare,.45)
    target[50,25:105]=.04
    layer=np.full((h,w,3),[.12,.08,.04],np.float32)
    layer[35,25:105]+=.4; layer[50,25:105]-=.8
    layer[10,25:105]+=.5
    candidate,delta=suppress(layer,bare,target,mask,80)
    assert delta[35,40] > .02, "bare lash halo not removed"
    assert np.array_equal(candidate[50],layer[50]), "new dark graphic ink modified"
    assert np.array_equal(candidate[mask==0],layer[mask==0]), "outside mask changed"
    assert np.allclose(candidate-candidate.mean(-1,keepdims=True),
                       layer-layer.mean(-1,keepdims=True),atol=1e-6), "chroma changed"
    flat=np.full_like(layer,.2)
    assert not np.any(suppress(flat,bare,target,mask,80)[1] > 1e-6), "broad pigment removed"
    roundoff=mask.copy(); roundoff[35,40]=np.nextafter(np.float32(1),np.float32(2))
    assert np.array_equal(suppress(layer,bare,target,roundoff,80)[0],candidate)
    invalid=mask.copy(); invalid[35,40]=1.01
    try:
        suppress(layer,bare,target,invalid,80)
    except ValueError:
        pass
    else:
        raise AssertionError("materially invalid support accepted")
    common=target.copy(); common[35,25:105]=.09
    assert suppress(layer,bare,common,mask,80)[1][35,40] < delta[35,40], "shared dark line not protected"
    try:
        suppress(layer,bare,target,mask,float("nan"))
    except ValueError:
        pass
    else:
        raise AssertionError("invalid geometry accepted")
    print("BARE_EYE_RESIDUAL_SYNTHETIC_PASS",flush=True)

def upper_support(T,p,shape,ew):
    support=np.zeros(shape,np.uint8)
    for eye,brow in ((T.EYE_R,T.BROW_LOW_R),(T.EYE_L,T.BROW_LOW_L)):
        q=p[:,:2]
        hull=cv2.convexHull(np.float32(np.vstack([q[eye[:9]],q[brow]])))
        cv2.fillConvexPoly(support,np.int32(np.round(hull)),1)
    # Strict masks: no eye opening, brow, lips or exterior pixels.
    excluded=T.poly_mask(shape,p[:,:2],[T.EYE_R,T.EYE_L,T.BROW_R,T.BROW_L,T.LIPS_OUT])>0
    face=T.poly_mask(shape,p[:,:2],[T.OVAL])>.5
    k=max(1,int(round(.025*ew)))
    kernel=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(2*k+1,2*k+1))
    excluded=cv2.dilate(excluded.astype(np.uint8),kernel)>0
    face=cv2.erode(face.astype(np.uint8),kernel)>0
    hard=(support>0)&~excluded&face
    weight=cv2.GaussianBlur(hard.astype(np.float32),(0,0),max(1.,ew*.025))*hard
    return weight.astype(np.float32)

def audit(T,look):
    base,pb=T._bare()
    im=T.rgb(T.LOOKS/(look+".webp"))
    p=T.landmarks3(im)
    if p is None or not np.isfinite(p).all():
        raise RuntimeError("invalid catalog landmarks: "+look)
    shape=im.shape[:2]
    bw,cov=T.mesh_warp(T.lin(base),pb,p,shape)
    layer,_,_=T.layer_parts(look)
    target=T.lin(im)/np.exp(T.grading(look))
    ew=T.eye_width(p)
    mask=upper_support(T,p,shape,ew)*(cov>.95)
    candidate,delta=suppress(layer,T.luma(bw),T.luma(target),mask,ew)
    diff=candidate-layer
    changed=np.any(diff!=0,axis=-1)
    if np.any(changed&(mask==0)):
        raise AssertionError(look+": changed protected pixel")
    if np.any(diff>1e-7) or np.max(np.abs(diff[:,:,0]-diff[:,:,1]))>1e-6 or np.max(np.abs(diff[:,:,1]-diff[:,:,2]))>1e-6:
        raise AssertionError(look+": changed chroma or lightened a pixel")
    if np.any(changed&(layer.mean(-1)<=0)):
        raise AssertionError(look+": altered dark makeup")
    # Direct reference fidelity is diagnostic, not ground truth for a new face.
    before=T.luma(bw*np.exp(layer)); after=T.luma(bw*np.exp(candidate))
    wanted=T.luma(target); valid=mask>.1
    if valid.sum()<30:
        raise AssertionError(look+": empty mobile-lid support")
    return dict(look=look, support_pixels=int(valid.sum()), changed_pixels=int(changed.sum()),
                max_log_correction=float(delta.max()), mean_log_correction=float(delta[valid].mean()),
                reference_luma_mae_before=float(np.mean(np.abs(before[valid]-wanted[valid]))),
                reference_luma_mae_after=float(np.mean(np.abs(after[valid]-wanted[valid]))),
                outside_changes=0, dark_makeup_changes=0, chroma_preserved=True)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--self-test",action="store_true")
    ap.add_argument("--all",action="store_true")
    ap.add_argument("--out",type=Path,default=Path("bare-eye-residual-report.json"))
    args=ap.parse_args()
    self_test()
    if args.self_test: return
    sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"tinybeauty"))
    import teacher as T
    catalog=T.catalog_looks()
    looks=catalog if args.all else ["mod-60s","cut-crease","electric-blue","arabic-glam","glitter-party","icy","no-makeup","classic-smokey","hollywood","soft-glam"]
    if args.all and len(set(looks))!=48:
        raise RuntimeError("expected complete 48-look public catalog")
    rows=[]
    for look in looks:
        if look not in catalog: raise RuntimeError("missing "+look)
        row=audit(T,look); rows.append(row)
        print("BARE_EYE_RESIDUAL_AUDIT "+json.dumps(row),flush=True)
        T.layer_parts.cache_clear()
    if not any(r["changed_pixels"]>0 for r in rows):
        raise RuntimeError("candidate never activated")
    report=dict(source="public catalog only",candidate="bare-ridge positive residual suppression",
                full_catalog=args.all,rows=rows,production_assets_changed=False,
                limitations="source-layer safety only; no actual GPU or generalization claim")
    args.out.write_text(json.dumps(report,indent=2))
    print("BARE_EYE_RESIDUAL_SOURCE_PASS",len(rows),flush=True)

if __name__=="__main__":
    main()
