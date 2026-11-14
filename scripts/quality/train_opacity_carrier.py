#!/usr/bin/env python3
"""Train a small cosmetic-only alpha model from PRIVATE verified paired data.

The model never predicts RGB face pixels. Its only output is a masked
cosmetic-opacity field; a linear-light compositor applies known pigment to
the original photograph. This hard source-identity boundary is essential.

Real-data training requires a PRIVATE subject-disjoint index produced by
prepare_paired_dataset.py and independently verified consent/license records.

Synthetic smoke runs are only engineering checks, never quality evidence.
No checkpoints are copied to public/tryon and no GitHub artifacts are
uploaded. This is NOT a qualified final photorealistic transfer model.

  python scripts/quality/train_opacity_carrier.py \
    --index /private/pairs/subject-disjoint-index.json \
    --out /private/training/carrier-r1 --epochs 25 --side 192
"""
from __future__ import annotations

import argparse
from hashlib import sha256
import json
import math
from pathlib import Path
import random

import numpy as np
from PIL import Image
import torch
from torch import nn
import torch.nn.functional as F

ROOT = Path(__file__).resolve().parents[2]
REGIONS = ("lips","eyes","cheeks")


def linear(v: torch.Tensor) -> torch.Tensor:
    return torch.where(v<=.04045,v/12.92,((v+.055)/1.055).clamp_min(0).pow(2.4))


def to_srgb(v: torch.Tensor) -> torch.Tensor:
    return torch.where(v<=.0031308,v*12.92,1.055*v.clamp_min(0).pow(1/2.4)-.055)


def masked_composite(source: torch.Tensor, pigment: torch.Tensor,
                     alpha: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
    """Return linear-light composited sRGB, pixel-identical outside mask."""
    safe_alpha=alpha.clamp(0,1)*mask.clamp(0,1)
    src_linear=linear(source.clamp(0,1))
    rgb_linear=src_linear*(1-safe_alpha)+linear(pigment.clamp(0,1))*safe_alpha
    composited=to_srgb(rgb_linear.clamp(0,1)).clamp(0,1)
    return torch.where(mask>0,composited,source)


class Block(nn.Module):
    def __init__(self, in_channels: int, out_channels: int):
        super().__init__()
        self.net=nn.Sequential(
            nn.Conv2d(in_channels,out_channels,3,padding=1),
            nn.GroupNorm(4,out_channels),nn.SiLU(),
            nn.Conv2d(out_channels,out_channels,3,padding=1),
            nn.GroupNorm(4,out_channels),nn.SiLU(),
        )
    def forward(self,x):
        return self.net(x)


class OpacityCarrier(nn.Module):
    """10-channel source/region/pigment context -> bounded 1-channel alpha.

    Input: source RGB (3), legal mask (1), pigment RGB (3), region onehot (3).
    Output: transparency inside the permitted mask only.
    """
    def __init__(self,base: int=20):
        super().__init__()
        if base%4:
            raise ValueError("Base channels must be divisible by four")
        self.enc1=Block(10,base)
        self.enc2=Block(base,base*2)
        self.enc3=Block(base*2,base*4)
        self.mid=Block(base*4,base*4)
        self.dec2=Block(base*6,base*2)
        self.dec1=Block(base*3,base)
        self.out=nn.Conv2d(base,1,1)

    def forward(self,source,mask,pigment,region):
        if source.ndim!=4 or source.shape[1]!=3 or mask.shape!=source[:, :1].shape:
            raise ValueError("Expected source Bx3xHxW and mask Bx1xHxW")
        if pigment.shape!=(source.shape[0],3,1,1) or region.shape!=(source.shape[0],3,1,1):
            raise ValueError("Expected pigment and region Bx3x1x1")
        b,_,h,w=source.shape
        if h%4 or w%4:
            raise ValueError("Input dimensions must be divisible by 4")
        fields=torch.cat([
            source,mask,pigment.expand(b,3,h,w),region.expand(b,3,h,w)
        ],1)
        e1=self.enc1(fields)
        e2=self.enc2(F.avg_pool2d(e1,2))
        e3=self.enc3(F.avg_pool2d(e2,2))
        core=self.mid(e3)
        d2=self.dec2(torch.cat([F.interpolate(core,size=e2.shape[-2:],mode="bilinear",align_corners=False),e2],1))
        d1=self.dec1(torch.cat([F.interpolate(d2,size=e1.shape[-2:],mode="bilinear",align_corners=False),e1],1))
        return torch.sigmoid(self.out(d1))*mask.clamp(0,1)


def region_crop(mask: np.ndarray, padding: float=0.50) -> tuple[int,int,int,int]:
    yy,xx=np.where(mask>0)
    if yy.size<20:
        raise ValueError("Too little reviewed cosmetic area")
    x0,x1=int(xx.min()),int(xx.max())+1
    y0,y1=int(yy.min()),int(yy.max())+1
    side=max(48,int(math.ceil(max(x1-x0,y1-y0)*(1+2*padding))))
    cx=(x0+x1)//2;cy=(y0+y1)//2
    return (cx-side//2,cy-side//2,cx-side//2+side,cy-side//2+side)


def resized_crop(img: Image.Image, box, size: int, mode: str, *, hard_mask: bool=False) -> np.ndarray:
    if img.mode!=mode:
        img=img.convert(mode)
    # Pillow pads out-of-image crop areas using zero. No upscaling is
    # allowed for released master imagery; these are training patches only.
    # Keep soft fractional opacity labels continuous; legal safety masks
    # are binary, thresholded after nearest-neighbor interpolation.
    method=Image.Resampling.NEAREST if hard_mask else Image.Resampling.BILINEAR
    patch=img.crop(box).resize((size,size),method)
    return np.asarray(patch,dtype=np.float32)/255


class PairedOpacityDataset(torch.utils.data.Dataset):
    def __init__(self,index_path: Path,split: str,side: int):
        if side<96 or side%4:
            raise ValueError("Training crop must be at least 96px and divisible by 4")
        index=json.loads(index_path.read_text(encoding="utf8"))
        if index.get("schema_version")!=1 or index.get("subject_disjoint") is not True:
            raise ValueError("Missing verified subject-disjoint data index")
        if index.get("model_promoted") is not False:
            raise ValueError("Imported index wrongly claims model promotion")
        self.root=Path(index["data_root"]).resolve()
        self.entries=[e for e in index["records"] if e["split"]==split]
        if not self.entries:
            raise ValueError(f"No {split} entries; refused empty evaluation")
        self.side=side

    def __len__(self):
        return len(self.entries)

    def __getitem__(self,k):
        entry=self.entries[k]
        files={}
        for name in ("source","target","mask","alpha"):
            path=(self.root/entry["files"][name]).resolve()
            if not path.is_relative_to(self.root):
                raise ValueError("Source path escaped private dataset")
            files[name]=path
        # Never silently train on pixels changed since signed dataset indexing.
        for name,key in (("source","source_sha256"),("target","target_sha256"),
                         ("mask","mask_sha256"),("alpha","alpha_sha256")):
            if sha256(files[name].read_bytes()).hexdigest()!=entry[key]:
                raise ValueError("Dataset image hash changed since private preflight")
        with Image.open(files["mask"]) as m:
            area=np.asarray(m.convert("L"),dtype=np.uint8)
            box=region_crop(area)
        patches={}
        for name in ("source","target","mask","alpha"):
            with Image.open(files[name]) as img:
                patches[name]=resized_crop(img,box,self.side,
                    "RGB" if name in ("source","target") else "L",
                    hard_mask=(name=="mask"))
        source=torch.from_numpy(patches["source"].transpose(2,0,1).copy()).float()
        target=torch.from_numpy(patches["target"].transpose(2,0,1).copy()).float()
        mask=torch.from_numpy((patches["mask"]>0.5).astype(np.float32)).unsqueeze(0)
        label=torch.from_numpy(patches["alpha"]).unsqueeze(0).float()*mask
        shade=entry["pigment"]
        pigment=torch.tensor([int(shade[j:j+2],16)/255 for j in (1,3,5)],dtype=torch.float32).view(3,1,1)
        region=torch.zeros(3,1,1)
        region[REGIONS.index(entry["region"])]=1
        return source,target,mask,label,pigment,region


def losses(pred,alpha,source,target,mask,pigment):
    denom=(mask.sum()*1).clamp_min(1)
    alpha_l1=((pred-alpha).abs()*mask).sum()/denom
    predicted=masked_composite(source,pigment,pred,mask)
    rgb_error=((predicted-target).abs()*mask).sum()/(denom*3)
    # Preserve sharp alpha transitions at product boundaries when the
    # supervised source mask genuinely contains such detail.
    grad_pred_x=pred[:,:,:,1:]-pred[:,:,:,:-1]
    grad_alpha_x=alpha[:,:,:,1:]-alpha[:,:,:,:-1]
    grad_pred_y=pred[:,:,1:,:]-pred[:,:,:-1,:]
    grad_alpha_y=alpha[:,:,1:,:]-alpha[:,:,:-1,:]
    edge=(grad_pred_x-grad_alpha_x).abs().mean()+(grad_pred_y-grad_alpha_y).abs().mean()
    total=alpha_l1+0.7*rgb_error+0.12*edge
    return total,{"alpha_mae":float(alpha_l1.detach()),"render_rgb_mae":float(rgb_error.detach()),
                  "edge_error":float(edge.detach())}


def evaluate(model,dataset,device):
    model.eval()
    metrics=[]
    with torch.no_grad():
        for i in range(len(dataset)):
            src,tgt,mask,alpha,pig,region=dataset[i]
            src,tgt,mask,alpha,pig,region=(x.unsqueeze(0).to(device) for x in (src,tgt,mask,alpha,pig,region))
            pred=model(src,mask,pig,region)
            _,info=losses(pred,alpha,src,tgt,mask,pig)
            metrics.append(info)
    return {k:round(float(np.mean([x[k] for x in metrics])),6) for k in metrics[0]}


def train(index: Path,out: Path,*,epochs: int=25,side: int=192,
          lr: float=2e-4,seed: int=20261114,batch_size: int=4):
    if not (1<=epochs<=300 and 96<=side<=512 and side%4==0
            and 0<lr<=.01 and 1<=batch_size<=16):
        raise ValueError("Invalid training hyperparameters")
    if out.resolve().is_relative_to(ROOT):
        raise ValueError("Never store private trained weights inside the public repo")
    index_data=json.loads(index.read_text(encoding="utf8"))
    if index_data.get("subject_disjoint") is not True:
        raise ValueError("Source photo split is not subject-disjoint")
    # The flag alone is not proof: verify actual per-person isolation
    # before seeing any held-out image or optimizer step.
    owners={}
    for record in index_data.get("records",[]):
        subject=record.get("subject_id")
        split=record.get("split")
        if split not in ("train","val","test") or not isinstance(subject,str):
            raise ValueError("Invalid subject/split metadata in private dataset")
        previous=owners.setdefault(subject,split)
        if previous!=split:
            raise ValueError("Subject leakage between train/val/test detected")
    torch.manual_seed(seed);np.random.seed(seed);random.seed(seed)
    # Avoid oversubscription on CPU-limited CI/phone-development machines.
    if not torch.cuda.is_available():
        torch.set_num_threads(min(4,max(1,torch.get_num_threads())))
    device=torch.device("cuda" if torch.cuda.is_available() else "cpu")
    ds={name:PairedOpacityDataset(index,name,side) for name in ("train","val","test")}
    model=OpacityCarrier().to(device)
    optimizer=torch.optim.AdamW(model.parameters(),lr=lr,weight_decay=1e-4)
    best=float("inf")
    best_state=None
    history=[]
    for epoch in range(epochs):
        model.train()
        loader=torch.utils.data.DataLoader(ds["train"],batch_size=batch_size,
                            shuffle=True,num_workers=0)
        training=[]
        for source,target,mask,alpha,pigment,region in loader:
            source,target,mask,alpha,pigment,region=(x.to(device) for x in
                (source,target,mask,alpha,pigment,region))
            pred=model(source,mask,pigment,region)
            loss,info=losses(pred,alpha,source,target,mask,pigment)
            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(),1.0)
            optimizer.step()
            training.append(info["alpha_mae"])
        val=evaluate(model,ds["val"],device)
        history.append({"epoch":epoch+1,"train_alpha_mae":round(float(np.mean(training)),6),
                        "val":val})
        if val["alpha_mae"]<best:
            best=val["alpha_mae"]
            best_state={k:v.detach().cpu().clone() for k,v in model.state_dict().items()}
    if best_state is None:
        raise AssertionError("Training produced no validated model checkpoint")
    model.load_state_dict(best_state)
    heldout=evaluate(model,ds["test"],device)
    out.mkdir(parents=True,exist_ok=True)
    weights=out/"research-carrier-unapproved.pt"
    torch.save({"state_dict":best_state,"channels":10,
                "regions":REGIONS,"side":side,"research_only":True},weights)
    manifest={
        "status":"research-trained-unapproved",
        "commercial_training_license_human_verified_by_software":False,
        "catalog_approved":False,"deploy_to_live_app":False,
        "data_index_sha256":sha256(index.read_bytes()).hexdigest(),
        "subject_counts":index_data["subject_counts"],
        "architecture":"source-and-region-conditioned-opacity-only-unet",
        "parameters":sum(x.numel() for x in model.parameters()),
        "device":str(device),"epochs":epochs,"crop_size":side,
        "best_val_alpha_mae":round(best,6),"heldout_test":heldout,
        "weights_file":weights.name,"history":history,
        "warnings":[
            "No result is a guarantee of photorealistic makeup, identity quality or suitability for the salon catalog",
            "Synthetic-only smoke training does not demonstrate generalization to human faces",
            "The test set must remain untouched during selection; validate on new external people and lighting",
            "No automatic deployment, public upload or model promotion is allowed",
        ]
    }
    (out/"training-report.json").write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf8")
    return manifest


def main():
    p=argparse.ArgumentParser()
    p.add_argument("--index",type=Path,required=True)
    p.add_argument("--out",type=Path,required=True)
    p.add_argument("--epochs",type=int,default=25)
    p.add_argument("--side",type=int,default=192)
    p.add_argument("--batch-size",type=int,default=4)
    p.add_argument("--lr",type=float,default=2e-4)
    args=p.parse_args()
    result=train(args.index,args.out,epochs=args.epochs,side=args.side,
                 lr=args.lr,batch_size=args.batch_size)
    print(json.dumps({k:v for k,v in result.items() if k!="history"},indent=2))


if __name__=="__main__":
    main()
