"""Source-locked composite regression tests. Only synthetic, non-person fixtures."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from compose_source_locked import compose, preflight


class SourceLockedCompositorTests(unittest.TestCase):
    def fixture(self, root: Path):
        root.mkdir(parents=True, exist_ok=True)
        size = (300, 400)
        master = Image.new("RGB", size, (182, 136, 110))
        candidate = master.copy()
        allowed = Image.new("L", size, 0)
        ImageDraw.Draw(allowed).ellipse((90, 165, 210, 210), fill=255)
        # Cosmetic pigment is deliberately inset within the mask so the
        # protected external skin and the surrounding transition remain fixed.
        ImageDraw.Draw(candidate).ellipse((104, 174, 196, 201), fill=(142, 31, 50))
        files = (root / "master.png", root / "candidate.png", root / "mask.png")
        for image, path in zip((master, candidate, allowed), files):
            image.save(path)
        return files

    def test_source_locked_makeup_preserves_every_protected_pixel(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            x, y, z = self.fixture(root)
            output = root / "output"
            result = compose(x, y, z, output, feather=5)
            self.assertTrue(result["passed"], result["errors"])
            self.assertEqual(result["changed_outside_mask_pixels"], 0)
            self.assertEqual(result["composite_changed_outside_mask_pixels"], 0)
            self.assertGreater(result["changed_inside_mask_pixels"], 0)
            with Image.open(x) as a, Image.open(output / "source-locked-composite.png") as b, Image.open(z) as m:
                src, dst, mask = np.asarray(a), np.asarray(b), np.asarray(m)
                np.testing.assert_array_equal(src[mask == 0], dst[mask == 0])
                self.assertFalse(np.array_equal(src[mask > 0], dst[mask > 0]))
            self.assertTrue((output / "pixel-lock" / "audit.json").exists())
            self.assertTrue((output / "forbidden-changes.png").exists())

    def test_independent_generated_image_drift_is_blocked(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            x, y, z = self.fixture(root)
            with Image.open(y) as im:
                candidate = im.copy()
            candidate.putpixel((25, 25), (4, 6, 9))
            candidate.save(y)
            result = compose(x, y, z, root / "out")
            self.assertFalse(result["passed"])
            self.assertEqual(result["changed_outside_mask_pixels"], 1)
            self.assertIn("OUTSIDE", " ".join(result["errors"]))
            self.assertFalse((root / "out" / "source-locked-composite.png").exists())

    def test_mask_edge_that_cuts_lip_pigment_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            x, y, z = self.fixture(root)
            with Image.open(y) as im:
                candidate = im.copy()
            ImageDraw.Draw(candidate).ellipse((90, 165, 210, 210), fill=(110, 20, 35))
            candidate.save(y)
            result = preflight(x, y, z, root / "out", feather=7)
            self.assertFalse(result["passed"])
            self.assertIn("Mask edge", " ".join(result["errors"]))
            self.assertGreater(result["edge_mean_rgb_difference"], 12)

    def test_too_thin_mask_is_rejected_for_selected_feather(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            x, y, z = self.fixture(root)
            thin = Image.new("L", (300, 400), 0)
            ImageDraw.Draw(thin).rectangle((120, 180, 220, 182), fill=255)
            thin.save(z)
            with Image.open(x) as im:
                candidate = im.copy()
            ImageDraw.Draw(candidate).line(((125, 181), (215, 181)), fill=(90, 10, 15))
            candidate.save(y)
            result = preflight(x, y, z, root / "out", feather=7)
            self.assertFalse(result["passed"])
            self.assertIn("too thin", " ".join(result["errors"]))

    def test_nonopaque_input_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            x, y, z = self.fixture(root)
            with Image.open(y) as im:
                candidate = im.convert("RGBA")
            candidate.putpixel((20, 20), (182, 136, 110, 0))
            candidate.save(y)
            result = preflight(x, y, z, root / "out")
            self.assertFalse(result["passed"])
            self.assertIn("Non-opaque", " ".join(result["errors"]))

    def test_premium_rejects_unverified_small_photo_dimensions(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            x, y, z = self.fixture(root)
            result = preflight(x, y, z, root / "out", premium=True)
            self.assertFalse(result["passed"])
            self.assertIn("native", " ".join(result["errors"]))

    def test_output_report_is_explicit_about_artist_approval(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            x, y, z = self.fixture(root)
            result = compose(x, y, z, root / "out", feather=5)
            self.assertTrue(result["requires_visual_approval"])
            data = json.loads((root / "out" / "preflight.json").read_text())
            self.assertTrue(data["requires_visual_approval"])
            self.assertTrue(any("authentic" in sentence for sentence in data["notes"]))


if __name__ == "__main__":
    unittest.main()
