"""Synthetic V5 A/B comparison tests: no real person's photo or face stored."""
from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest

from PIL import Image

sys.path.insert(0,str(Path(__file__).resolve().parent))
from test_source_mesh_pipeline import MeshDerivedPilots
from author_mesh_pilot_masks import generate
from compare_material_v5 import compare


class V5PhotographicMaterialComparisons(unittest.TestCase):
    def test_four_public_style_variants_preserve_source_and_emit_review_evidence(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            source,mesh,_=MeshDerivedPilots().fixture(root)
            generated=root/"generated"
            generate(source,mesh,generated)
            out=root/"comparisons"
            report=compare(source,generated,out)
            self.assertEqual(len(report["styles"]),4)
            self.assertFalse(report["full_catalog_style_fidelity"])
            self.assertFalse(report["synthetic_or_painted_appearance_approval"])
            self.assertTrue((out/"before-after-v5-contact-sheet.jpg").exists())
            self.assertEqual(len(list(out.glob("*-eyes-lips-review.jpg"))),4)
            for style,info in report["styles"].items():
                self.assertEqual(info["changed_v5_vs_legacy_outside_masks"],0)
                self.assertTrue(info["v5_pixel_locked"])
                self.assertFalse(info["artist_approved"])
                with Image.open(out/style/"rendered/material-render.png") as im:
                    self.assertEqual(im.size,(500,650))
                self.assertTrue((out/style/"rendered/pixel-lock/audit.json").is_file())
                self.assertTrue((out/"legacy"/style/"material-render.png").is_file())
                self.assertTrue((out/"legacy"/style/"material-render-report.json").is_file())
                if style=="rhinestone":
                    layers=json.loads(
                        (out/style/"rendered/material-render-report.json").read_text()
                    )["layers"]
                    gloss=next(layer for layer in layers if layer["name"]=="rose_gloss")
                    self.assertEqual(gloss["appearance_model"],"source-relief-v5")
                self.assertFalse((generated/style/f"{style}-v5.json").exists())
            self.assertTrue((out/"review-report.json").is_file())

    def test_wrong_original_photo_is_rejected_before_ab_render(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            source,mesh,_=MeshDerivedPilots().fixture(root)
            generated=root/"generated"
            generate(source,mesh,generated)
            with Image.open(source) as im:
                altered=im.copy()
            altered.putpixel((10,10),(255,255,255))
            altered.save(source)
            with self.assertRaisesRegex(ValueError,"hash mismatch"):
                compare(source,generated,root/"bad")


if __name__=="__main__":
    unittest.main()
