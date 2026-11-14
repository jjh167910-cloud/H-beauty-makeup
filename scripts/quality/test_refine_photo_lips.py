"""Photo-guided lip refinement regression tests; use synthetic color swatches only."""
from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

import numpy as np
from PIL import Image, ImageDraw

from refine_photo_lips import refine


class PhotoLipRefinementTests(unittest.TestCase):
    def fixture(self, root: Path):
        root.mkdir(parents=True,exist_ok=True)
        original=Image.new("RGB",(320,420),(207,166,143))
        draw=ImageDraw.Draw(original)
        # Saturated but source-photographed lipstick inner contour.
        draw.ellipse((112,272,211,313),fill=(143,60,82))
        draw.line((127,293,196,293),fill=(81,32,47),width=2)
        photo=root/"synthetic-source.png"
        original.save(photo)
        mask=Image.new("L",(320,420),0)
        ImageDraw.Draw(mask).ellipse((105,267,220,319),fill=255)
        allowed=root/"coarse-lip-ring.png"
        mask.save(allowed)
        return photo,allowed

    def test_photo_edges_can_refine_an_overbroad_lip_ring(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            photo,coarse=self.fixture(root)
            report=refine(photo,coarse,root/"out")
            self.assertTrue(report["engineering_preflight_passed"])
            self.assertFalse(report["approved_for_catalog"])
            self.assertEqual(report["added_outside_original_mask"],0)
            self.assertLess(report["refined_pixels"],report["coarse_pixels"])
            self.assertGreaterEqual(report["retention_percent"],45)
            self.assertTrue((root/"out"/"lip-region-edges.png").exists())
            original=np.asarray(Image.open(coarse))>0
            refined=np.asarray(Image.open(root/"out"/"refined-lips.png"))>0
            self.assertEqual(int(np.count_nonzero(refined & ~original)),0)

    def test_source_region_is_non_destructive_and_alpha_guarded(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            photo,coarse=self.fixture(root)
            with Image.open(photo) as im:
                opaque=im.copy()
            before=np.asarray(opaque)
            refine(photo,coarse,root/"out")
            np.testing.assert_array_equal(
                before,np.asarray(Image.open(photo).convert("RGB")))
            self.assertFalse((root/"out"/"bare-reference.png").exists())

    def test_reject_overly_broad_or_empty_masks(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            photo,coarse=self.fixture(root)
            Image.new("L",(320,420),0).save(coarse)
            with self.assertRaisesRegex(ValueError,"Invalid coarse"):
                refine(photo,coarse,root/"out")
            Image.new("L",(320,420),255).save(coarse)
            with self.assertRaisesRegex(ValueError,"Invalid coarse"):
                refine(photo,coarse,root/"out")

    def test_invalid_mask_does_not_leave_old_approved_looking_output(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            photo,coarse=self.fixture(root)
            folder=root/"out"
            refine(photo,coarse,folder)
            self.assertTrue((folder/"refined-lips.png").exists())
            Image.new("RGB",(320,420),(255,0,0)).save(coarse)
            with self.assertRaisesRegex(ValueError,"grayscale"):
                refine(photo,coarse,folder)
            self.assertFalse((folder/"refined-lips.png").exists())
            self.assertFalse((folder/"lip-refinement-report.json").exists())

    def test_reject_mask_of_wrong_source_dimensions(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            photo,coarse=self.fixture(root)
            Image.new("L",(200,200),0).save(coarse)
            with self.assertRaisesRegex(ValueError,"exact source dimensions"):
                refine(photo,coarse,root/"out")


if __name__=="__main__":
    unittest.main()
