#!/usr/bin/env python3
"""Export PRIVATE source-locked opacity research checkpoints to ONNX.

This is a porting/safety preflight, not a photographic makeup quality score,
Android speed certification, public model release, or production deployment.
Export only checkpoints trained in a private source-verified environment.

  python scripts/quality/export_opacity_onnx.py \
    --checkpoint /private/research/research-carrier-unapproved.pt \
    --out /private/research/onnx-review --parity-trials 5

Requires torch, onnx, onnxruntime, numpy. Tests exact mask confinement and
numerical parity on synthetic tensors only. NEVER uploads model weights,
private faces, consent documents or dataset metadata to public services.
"""
from __future__ import annotations

import argparse
from hashlib import sha256
import json
from pathlib import Path
import time

import numpy as np
import torch

from train_opacity_carrier import OpacityCarrier, ROOT, REGIONS

FILENAME="opacity-carrier-RESEARCH-ONLY.onnx"
INPUTS=("source","mask","pigment","region")
OUTPUT="alpha"
MAX_PARITY_ERROR=2e-4


def load_checkpoint(path: Path) -> tuple[OpacityCarrier,dict,int]:
    # weights_only=True is essential: never unpickle arbitrary Python
    # objects from an unknown checkpoint, even if it came from a project repo.
    checkpoint=torch.load(path,map_location="cpu",weights_only=True)
    if (not isinstance(checkpoint,dict) or checkpoint.get("research_only") is not True
            or checkpoint.get("channels")!=10 or tuple(checkpoint.get("regions",()))!=REGIONS):
        raise ValueError("Checkpoint does not match the unapproved 10-channel opacity-carrier contract")
    side=checkpoint.get("side")
    if not isinstance(side,int) or isinstance(side,bool) or not 96<=side<=512 or side%4:
        raise ValueError("Invalid trained fixed-side input")
    training_path=path.parent/"training-report.json"
    report=json.loads(training_path.read_text(encoding="utf8"))
    if (report.get("status")!="research-trained-unapproved"
            or report.get("catalog_approved") is not False
            or report.get("deploy_to_live_app") is not False
            or report.get("weights_file")!=path.name
            or report.get("crop_size")!=side):
        raise ValueError("Training provenance does not permit ONNX experimental export")
    state=checkpoint.get("state_dict")
    if not isinstance(state,dict):
        raise ValueError("Missing research model tensors")
    model=OpacityCarrier().cpu().eval()
    model.load_state_dict(state,strict=True)
    return model,report,side


def sample_inputs(side: int,seed: int,mode: str) -> tuple[np.ndarray,...]:
    rng=np.random.default_rng(seed)
    if mode=="black":
        source=np.zeros((1,3,side,side),dtype=np.float32)
    else:
        source=rng.uniform(.0,1.,(1,3,side,side)).astype(np.float32)
    mask=np.zeros((1,1,side,side),dtype=np.float32)
    if mode!="empty":
        x0,x1=int(side*.26),int(side*.79)
        y0,y1=int(side*.31),int(side*.67)
        mask[:,:,y0:y1,x0:x1]=1
    pigment=np.array([.65,.12,.17],dtype=np.float32).reshape(1,3,1,1)
    region=np.array([1.,0.,0.],dtype=np.float32).reshape(1,3,1,1)
    return source,mask,pigment,region


def export(checkpoint_path: Path,out: Path,parity_trials: int=5) -> dict:
    if not (2<=parity_trials<=30):
        raise ValueError("Expected 2-30 independent parity trials")
    out=out.resolve()
    if out.is_relative_to(ROOT):
        raise ValueError("Never export private experimental weights inside the public repository")
    out.mkdir(parents=True,exist_ok=True)
    for old in (FILENAME,"onnx-research-report.json"):
        (out/old).unlink(missing_ok=True)
    model,training,side=load_checkpoint(checkpoint_path)

    try:
        import onnx
        import onnxruntime as ort
    except ImportError as exc:
        raise RuntimeError("Install onnx and onnxruntime into the PRIVATE research environment") from exc

    # The legacy fixed-shape exporter is deliberate for a small 96..512px
    # mobile research crop. It avoids a moving dynamic-shape/export contract.
    # The ONNX graph only emits an alpha channel; source RGB is never
    # predicted or synthesized by the learned model.
    examples=sample_inputs(side,719,"normal")
    torch.onnx.export(
        model,tuple(torch.from_numpy(v) for v in examples),
        str(out/FILENAME),input_names=list(INPUTS),output_names=[OUTPUT],
        opset_version=17,dynamo=False,do_constant_folding=True
    )
    onnx_model=onnx.load(str(out/FILENAME))
    onnx.checker.check_model(onnx_model)
    if [v.name for v in onnx_model.graph.input]!=list(INPUTS):
        raise ValueError("ONNX input names changed unexpectedly")
    if [v.name for v in onnx_model.graph.output]!=[OUTPUT]:
        raise ValueError("Opacity-only ONNX output contract violated")
    session_options=ort.SessionOptions()
    session_options.intra_op_num_threads=2
    session=ort.InferenceSession(
        str(out/FILENAME),sess_options=session_options,
        providers=["CPUExecutionProvider"]
    )
    modes=("normal","black","empty")
    parity=[]
    durations=[]
    for i in range(parity_trials):
        mode=modes[i%len(modes)]
        inputs=sample_inputs(side,617+i,mode)
        feed=dict(zip(INPUTS,inputs))
        with torch.no_grad():
            reference=model(*(torch.from_numpy(x) for x in inputs)).numpy()
        start=time.perf_counter()
        candidate=session.run([OUTPUT],feed)[0]
        durations.append((time.perf_counter()-start)*1000)
        if candidate.shape!=(1,1,side,side):
            raise AssertionError("ONNX failed the fixed-size alpha-only output contract")
        if not np.isfinite(candidate).all() or candidate.min()<-1e-6 or candidate.max()>1.000001:
            raise AssertionError("ONNX opacity is nonfinite or outside [0,1]")
        if np.count_nonzero(candidate[inputs[1]==0]):
            raise AssertionError("ONNX changed pixels outside cosmetic region")
        diff=float(np.max(np.abs(reference-candidate)))
        if diff>MAX_PARITY_ERROR:
            raise AssertionError(f"ONNX/PyTorch parity drift {diff:.7f} above {MAX_PARITY_ERROR}")
        parity.append({"case":mode,"max_abs_alpha_error":round(diff,8),
                       "outside_mask_nonzero":0})
    model_path=out/FILENAME
    result={
        "status":"research-onnx-parity-verified",
        "approved_for_catalog":False,
        "deploy_to_app":False,
        "android_performance_verified":False,
        "trained_on_real_licensed_photos_verified":False,
        "source_checkpoint_sha256":sha256(checkpoint_path.read_bytes()).hexdigest(),
        "source_training_report_sha256":sha256((checkpoint_path.parent/"training-report.json").read_bytes()).hexdigest(),
        "onnx_sha256":sha256(model_path.read_bytes()).hexdigest(),
        "onnx_bytes":model_path.stat().st_size,
        "fixed_crop_side":side,
        "input_names":list(INPUTS),"output_names":[OUTPUT],
        "opset":17,
        "parity_trials":parity_trials,
        "max_alpha_parity_error":max(x["max_abs_alpha_error"] for x in parity),
        "cpu_onnxruntime_latency_ms_median":round(float(np.median(durations)),3),
        "cpu_onnxruntime_latency_ms_p95":round(float(np.percentile(durations,95)),3),
        "warnings":[
            "Measured latency is Python ONNX Runtime on CI/local CPU, NOT WebAssembly or physical Android",
            "A one-epoch synthetic checkpoint proves export mechanics only, not cosmetics realism",
            "No trained weight is suitable for shipping before verified rights and held-out human photo benchmarks",
            "Model returns an opacity field; the identity-preserving shader must composite source pixels separately",
            "No artifacts or weight files may be uploaded to public GitHub Actions or Cloudflare"
        ]
    }
    (out/"onnx-research-report.json").write_text(json.dumps(result,indent=2)+"\n",encoding="utf8")
    return result


def main() -> int:
    ap=argparse.ArgumentParser()
    ap.add_argument("--checkpoint",type=Path,required=True)
    ap.add_argument("--out",type=Path,required=True)
    ap.add_argument("--parity-trials",type=int,default=5)
    args=ap.parse_args()
    report=export(args.checkpoint,args.out,args.parity_trials)
    print(json.dumps(report,indent=2))
    return 0


if __name__=="__main__":
    raise SystemExit(main())
