"""Synthetic face-mesh tests. No real customers' faces or landmarks in CI."""
from __future__ import annotations

import json
import hashlib
from pathlib import Path
import tempfile
import sys
import unittest

import numpy as np
from PIL import Image

sys.path.insert(0,str(Path(__file__).resolve().parent))
from audit_landmark_masks import (
    EYE_L, EYE_R, BROW_L, BROW_R, LIPS_OUT, LIPS_IN,
    audit, anatomy_regions
)

W,H=500,650


def synthetic_face():
    points = np.full((478,2), .5, dtype=float)
    def set_loop(ids, cx,cy,rx,ry,phase):
        for i,index in enumerate(ids):
            ang = phase + 2*np.pi*i/len(ids)
            points[index] = [(cx+rx*np.cos(ang))/W,(cy+ry*np.sin(ang))/H]
    # Two photographic face-mesh eye openings with realistic brow clearance.
    set_loop(EYE_R,178,258,43,12,np.pi)
    set_loop(EYE_L,325,256,43,12,0)
    # 10 brow points in normalized coordinates, distinctly above upper lid.
    for ids,cx in ((BROW_R,178),(BROW_L,325)):
        for i,index in enumerate(ids):
            points[index]=[(cx-36+i*8)/W,(205+2*np.cos(i*np.pi/9))/H]
    set_loop(LIPS_OUT,251,427,61,24,np.pi)
    set_loop(LIPS_IN,251,427,43,5,np.pi)
    return points.tolist()


def fixture(root):
    root.mkdir(exist_ok=True,parents=True)
    master=root/"master.png"
    Image.new("RGB",(W,H),(170,124,106)).save(master)
    points=synthetic_face()
    mesh={
        "source_sha256":hashlib.sha256(master.read_bytes()).hexdigest(),
        "dimensions":[W,H],
        "coordinate_space":"normalized",
        "face_count":1,
        "detection_confidence":.96,
        "points":points,
    }
    landmarks=root/"landmarks.json"
    landmarks.write_text(json.dumps(mesh),encoding="utf8")
    p=np.asarray(points,dtype=float);p[:,0]*=W;p[:,1]*=H
    regions=anatomy_regions(p,(W,H))
    # Use actual safe regions as synthetic positive controls, and ensure the
    # eye opening and oral cavity remain fully unpainted.
    chosen={
        "lips":regions["lips"] & (np.indices((H,W))[0] < 413),
        "shadow":regions["shadow"] & (np.indices((H,W))[0] < 238),
        "liner":regions["liner"] & ~regions["protected_eyes"] &
                (np.indices((H,W))[0] < 257),
    }
    layers=[]
    for kind,mask in chosen.items():
        assert int(mask.sum())>10, (kind,int(mask.sum()))
        name=kind+".png"
        Image.fromarray(mask.astype("uint8")*255).save(root/name)
        layers.append({"kind":kind,"file":name})
    manifest=root/"manifest.json"
    manifest.write_text(json.dumps({"masks":layers}),encoding="utf8")
    return master,landmarks,manifest,mesh


class LandmarkAnatomyGateTests(unittest.TestCase):
    def test_valid_synthetic_face_masks_pass_but_never_approve_catalog(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            m,l,manifest,_=fixture(root)
            report=audit(m,l,manifest,root/"out")
            self.assertTrue(report["passed_anatomical_preflight"],report["errors"])
            self.assertFalse(report["approved_for_catalog"])
            self.assertTrue(report["requires_manual_makeup_artist_review"])
            self.assertEqual(report["total_pixels_outside_anatomy"],0)
            self.assertEqual(len(report["layers"]),3)
            self.assertTrue((root/"out"/"unauthorized-anatomy.png").exists())

    def test_lipstick_above_true_vermilion_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);m,l,manifest,_=fixture(root)
            bad=np.zeros((H,W),dtype="uint8")
            bad[367:378,230:270]=255
            Image.fromarray(bad).save(root/"lips.png")
            result=audit(m,l,manifest,root/"out")
            self.assertFalse(result["passed_anatomical_preflight"])
            self.assertIn("outside lips", " ".join(result["errors"]))

    def test_blue_eyeshadow_on_eyebrow_not_eyelid_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);m,l,manifest,_=fixture(root)
            bad=np.zeros((H,W),dtype="uint8")
            bad[202:213,145:208]=255
            Image.fromarray(bad).save(root/"shadow.png")
            result=audit(m,l,manifest,root/"out")
            self.assertFalse(result["passed_anatomical_preflight"])
            self.assertIn("outside shadow", " ".join(result["errors"]))

    def test_liner_detached_far_above_lash_roots_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);m,l,manifest,_=fixture(root)
            bad=np.zeros((H,W),dtype="uint8")
            bad[210:212,150:200]=255
            Image.fromarray(bad).save(root/"liner.png")
            result=audit(m,l,manifest,root/"out")
            self.assertFalse(result["passed_anatomical_preflight"])
            self.assertIn("outside liner", " ".join(result["errors"]))

    def test_eyeshadow_over_sclera_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);m,l,manifest,_=fixture(root)
            bad=np.zeros((H,W),dtype="uint8")
            bad[253:263,150:215]=255
            Image.fromarray(bad).save(root/"shadow.png")
            result=audit(m,l,manifest,root/"out")
            self.assertFalse(result["passed_anatomical_preflight"])
            self.assertIn("visible eye opening", " ".join(result["errors"]))

    def test_lipstick_over_mouth_opening_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);m,l,manifest,_=fixture(root)
            bad=np.zeros((H,W),dtype="uint8")
            bad[425:430,230:270]=255
            Image.fromarray(bad).save(root/"lips.png")
            result=audit(m,l,manifest,root/"out")
            self.assertFalse(result["passed_anatomical_preflight"])
            self.assertIn("inner mouth", " ".join(result["errors"]))

    def test_landmarks_from_a_different_photo_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);m,l,manifest,_=fixture(root)
            img=Image.open(m).convert("RGB")
            img.putpixel((15,15),(1,2,3))
            img.save(m)
            with self.assertRaisesRegex(ValueError,"DIFFERENT source"):
                audit(m,l,manifest,root/"out")

    def test_low_confidence_or_multiple_faces_prevent_false_promotion(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);m,l,manifest,meta=fixture(root)
            meta["detection_confidence"]=.45
            l.write_text(json.dumps(meta),encoding="utf8")
            with self.assertRaisesRegex(ValueError,"confidence"):
                audit(m,l,manifest,root/"out")
            meta["detection_confidence"]=.96
            meta["face_count"]=2
            l.write_text(json.dumps(meta),encoding="utf8")
            with self.assertRaisesRegex(ValueError,"Exactly one"):
                audit(m,l,manifest,root/"out")

    def test_premium_size_gate_rejects_reframed_low_res_photos(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);m,l,manifest,_=fixture(root)
            with self.assertRaisesRegex(ValueError,"Native premium"):
                audit(m,l,manifest,root/"out",premium=True)

    def test_non_grayscale_mask_rejected_and_no_success_report(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);m,l,manifest,_=fixture(root)
            Image.new("RGB",(W,H),(0,0,255)).save(root/"lips.png")
            with self.assertRaisesRegex(ValueError,"grayscale"):
                audit(m,l,manifest,root/"out")
            self.assertFalse((root/"out"/"anatomy-report.json").exists())

    def test_mask_path_escape_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);m,l,manifest,_=fixture(root)
            d=json.loads(manifest.read_text())
            d["masks"][0]["file"]="../secret-lips.png"
            manifest.write_text(json.dumps(d))
            with self.assertRaisesRegex(ValueError,"filename"):
                audit(m,l,manifest,root/"out")


if __name__=="__main__":
    unittest.main()
