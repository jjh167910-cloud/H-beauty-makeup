"""Synthetic structural tests for four UNAPPROVED, manually anchored masks."""
from __future__ import annotations
from hashlib import sha256
import json
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np
from PIL import Image

sys.path.insert(0,str(Path(__file__).resolve().parent))
from author_four_pilot_masks import DIMENSIONS, PILOTS, build_masks, write_masks


class FourPilotMaskTests(unittest.TestCase):
    def test_coverage_is_confined_to_reviewed_face_area(self):
        sets=build_masks()
        self.assertEqual(set(sets),set(PILOTS))
        self.assertEqual([len(sets[x]) for x in PILOTS],[3,5,4,5])
        for sid,layers in sets.items():
            union=np.zeros((DIMENSIONS[1],DIMENSIONS[0]),dtype=bool)
            for name,mask in layers.items():
                self.assertTrue(name.endswith(".png"))
                self.assertEqual(mask.size,DIMENSIONS)
                pixels=np.asarray(mask)>1
                self.assertGreater(int(pixels.sum()),50,(sid,name))
                # No part of the mask may touch hair, clothing, background,
                # forehead, face boundary or the full-image edge.
                self.assertFalse(pixels[:325,:].any(),(sid,name,"forehead"))
                self.assertFalse(pixels[720:,:].any(),(sid,name,"wardrobe"))
                self.assertFalse(pixels[:,:220].any(),(sid,name,"left hair"))
                self.assertFalse(pixels[:,720:].any(),(sid,name,"right hair"))
                union|=pixels
            self.assertLess(float(union.mean()),0.10,sid)

    def test_v4_masks_do_not_paint_upper_lip_skin_or_detached_eyeliner(self):
        sets = build_masks()
        for sid in PILOTS:
            lips_name = f"{sid}-lips.png"
            lip = np.asarray(sets[sid][lips_name], dtype=np.uint8)
            # The old mask painted normal skin above the cupid's bow.
            # It was several pixels too high around the middle upper lip.
            self.assertFalse((lip[:595, 390:545] > 1).any(),sid)
            self.assertTrue((lip[620:680, 390:535] > 1).any(),sid)
        for sid,liner_name in (
            ("hollywood","hollywood-wing.png"),
            ("electric-blue","electric-blue-graphic-liner.png"),
            ("rhinestone","rhinestone-liner.png"),
        ):
            liner = np.asarray(sets[sid][liner_name],dtype=np.uint8)
            # Only short outer-canthus strokes: no second floating line
            # spanning the whole eyelid above the original eyelashes.
            self.assertFalse((liner[:,290:605] > 1).any(),sid)
            self.assertGreater(int((liner > 1).sum()),20,sid)
        for sid in PILOTS:
            lid = np.asarray(sets[sid][f"{sid}-lid-wash.png"],dtype=np.uint8) if sid != "electric-blue" else np.asarray(sets[sid]["electric-blue-inner-lid.png"],dtype=np.uint8)
            self.assertFalse((lid[:345] > 1).any(),sid)

    def test_exact_sha_is_required_for_unsupported_source(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            source=root/"source.png"
            Image.new("RGB",DIMENSIONS,(120,140,145)).save(source)
            with self.assertRaisesRegex(ValueError,"SHA256"):
                write_masks(source,"0"*64,root/"reject")
            self.assertFalse((root/"reject").exists())
            sha=sha256(source.read_bytes()).hexdigest()
            report=write_masks(source,sha,root/"accepted")
            self.assertFalse(report["production_ready"])
            self.assertFalse(report["native_2k_approved"])
            self.assertTrue(report["marketing_source_is_synthetic"])
            self.assertEqual(len(report["styles"]),4)
            self.assertEqual(len(list((root/"accepted").rglob("*.png"))),17)
            saved=json.loads((root/"accepted"/"pilot-mask-manifest.json").read_text())
            self.assertEqual(saved["master_sha256"],sha)

    def test_wrong_source_dimensions_rejected_even_with_correct_sha(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            p=root/"wrong.png"
            Image.new("RGB",(900,1200),(120,120,120)).save(p)
            digest=sha256(p.read_bytes()).hexdigest()
            with self.assertRaisesRegex(ValueError,"Study coordinates require"):
                write_masks(p,digest,root/"result")


if __name__=="__main__":
    unittest.main()
