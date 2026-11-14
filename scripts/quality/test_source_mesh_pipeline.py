"""Offline face-mesh provenance tests. Synthetic geometry only; no real photos."""
from __future__ import annotations

from hashlib import sha256
import json
import sys
import tempfile
from pathlib import Path
import unittest

import numpy as np
from PIL import Image

sys.path.insert(0,str(Path(__file__).resolve().parent))
from detect_source_face import build_payload
from audit_landmark_masks import checked_mesh
from test_landmark_masks import synthetic_face
from author_mesh_pilot_masks import draft_regions, generate


class MeshDerivedPilots(unittest.TestCase):
    def fixture(self, root: Path):
        root.mkdir(parents=True, exist_ok=True)
        p=root/"bare-reference.png"
        Image.new("RGB",(500,650),(174,128,100)).save(p)
        mesh=build_payload(
            p.read_bytes(),500,650,synthetic_face(),
            face_count=1,
            min_face_detection_confidence=.85,
            min_face_presence_confidence=.85,
        )
        l=root/"source-mesh.json"
        l.write_text(json.dumps(mesh),encoding="utf8")
        return p,l,mesh

    def test_detector_does_not_fabricate_a_per_face_confidence_score(self):
        with tempfile.TemporaryDirectory() as temp:
            p,l,mesh=self.fixture(Path(temp))
            self.assertNotIn("detection_confidence",mesh)
            self.assertFalse(mesh["detection_policy"]["reported_per_face_confidence_available"])
            self.assertEqual(mesh["source_sha256"],sha256(p.read_bytes()).hexdigest())
            checked=checked_mesh(mesh,p,(500,650))
            self.assertEqual(checked.shape,(478,2))
            self.assertTrue(mesh["contains_sensitive_facial_geometry"])
            self.assertFalse(mesh["catalog_release_approved"])

    def test_missing_or_low_detector_policy_cannot_pass(self):
        with tempfile.TemporaryDirectory() as temp:
            p,l,mesh=self.fixture(Path(temp))
            bad=dict(mesh)
            bad.pop("detection_policy")
            with self.assertRaisesRegex(ValueError,"No measured"):
                checked_mesh(bad,p,(500,650))
            bad=dict(mesh)
            bad["detection_policy"]=dict(mesh["detection_policy"])
            bad["detection_policy"]["min_face_presence_confidence"]=.5
            with self.assertRaisesRegex(ValueError,"threshold"):
                checked_mesh(bad,p,(500,650))
            bad=dict(mesh)
            bad["detection_policy"]=dict(mesh["detection_policy"])
            bad["detection_policy"]["reported_per_face_confidence_available"]=True
            with self.assertRaisesRegex(ValueError,"Unsupported"):
                checked_mesh(bad,p,(500,650))

    def test_source_mismatch_is_rejected_before_masks_are_generated(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);p,l,_=self.fixture(root)
            with Image.open(p) as im:
                changed=im.copy()
            changed.putpixel((3,3),(1,3,5))
            changed.save(p)
            with self.assertRaisesRegex(ValueError,"DIFFERENT source"):
                generate(p,l,root/"out")
            self.assertFalse((root/"out").exists())

    def test_four_draft_mask_sets_are_anatomy_checked_and_private(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);p,l,_=self.fixture(root)
            result=generate(p,l,root/"out")
            self.assertEqual(len(result["styles"]),4)
            self.assertFalse(result["artist_approved"])
            self.assertFalse(result["full_catalog_style_fidelity"])
            self.assertEqual(len(list((root/"out").rglob("*-mask.png"))),0)
            for sid,style in result["styles"].items():
                self.assertTrue(style["anatomical_gate_passed"])
                self.assertFalse(style["artist_approved"])
                folder=root/"out"/sid
                self.assertTrue((folder/f"{sid}.json").is_file())
                self.assertTrue((folder/"anatomy-qa"/"anatomy-report.json").is_file())
                m=json.loads((folder/"anatomy-qa"/"anatomy-report.json").read_text())
                self.assertTrue(m["passed_anatomical_preflight"])
                self.assertEqual(m["total_pixels_outside_anatomy"],0)
                self.assertFalse(m["approved_for_catalog"])
            # No original portrait is duplicated in the output directory.
            self.assertEqual(len(list((root/"out").rglob("bare-reference.png"))),0)

    def test_mask_geometry_is_source_specific(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);p,l,mesh=self.fixture(root)
            a=checked_mesh(mesh,p,(500,650))
            masks=draft_regions(a,(500,650))
            for key in ("lips","shadow","liner","blue_inner","blue_outer"):
                self.assertEqual(masks[key].shape,(650,500))
                self.assertTrue(masks[key].dtype==bool)
            # No blue mask may be outside its own anatomical shadow envelope.
            self.assertEqual(np.count_nonzero(masks["blue_inner"] & ~masks["shadow"]),0)
            self.assertEqual(np.count_nonzero(masks["blue_outer"] & ~masks["shadow"]),0)


if __name__=="__main__":
    unittest.main()
