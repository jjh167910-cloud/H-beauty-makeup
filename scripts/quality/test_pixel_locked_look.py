"""Tests for strict makeup region protection. All images are synthetic fixtures."""
from __future__ import annotations

import tempfile
from pathlib import Path
import sys
import unittest

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from audit_pixel_locked_look import audit


class PixelLockedLookTests(unittest.TestCase):
    def pair(self, root: Path):
        root.mkdir(parents=True, exist_ok=True)
        a = Image.new("RGB", (180, 240), (190, 150, 125))
        b = a.copy()
        m = Image.new("L", a.size, 0)
        ImageDraw.Draw(m).ellipse((53, 107, 119, 136), fill=255)
        ImageDraw.Draw(b).ellipse((53, 107, 119, 136), fill=(130, 23, 37))
        x, y, z = root / "master.png", root / "look.png", root / "mask.png"
        a.save(x)
        b.save(y)
        m.save(z)
        return x, y, z

    def test_changed_makeup_with_identical_protected_pixels_passes(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            x, y, z = self.pair(root)
            result = audit(x, y, z, root / "out")
            self.assertTrue(result["passed"], result["errors"])
            self.assertEqual(result["changed_outside_mask_pixels"], 0)
            self.assertGreater(result["changed_inside_mask_pixels"], 0)
            self.assertTrue(result["requires_artist_review"])
            self.assertTrue((root / "out" / "protected-differences.png").exists())

    def test_unapproved_single_pixel_change_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            x, y, z = self.pair(root)
            with Image.open(y) as original:
                changed = original.copy()
            changed.putpixel((5, 5), (0, 0, 0))
            changed.save(y)
            result = audit(x, y, z, root / "out")
            self.assertFalse(result["passed"])
            self.assertEqual(result["changed_outside_mask_pixels"], 1)

    def test_incorrect_framing_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            x, y, z = self.pair(root)
            Image.new("RGB", (160, 240), "white").save(y)
            result = audit(x, y, z, root / "out")
            self.assertFalse(result["passed"])
            self.assertIn("Dimensions differ", " ".join(result["errors"]))

    def test_premium_native_size_cannot_be_faked(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            x, y, z = self.pair(root)
            result = audit(x, y, z, root / "out", premium=True)
            self.assertFalse(result["passed"])
            self.assertIn("below native", " ".join(result["errors"]))

    def test_mask_whole_image_cannot_bypass_protection(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            x, y, z = self.pair(root)
            Image.new("L", (180, 240), 255).save(z)
            result = audit(x, y, z, root / "out")
            self.assertFalse(result["passed"])
            self.assertIn("covers", " ".join(result["errors"]))
            self.assertIn("border", " ".join(result["errors"]))

    def test_identical_images_do_not_count_as_finished_makeup(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            x, y, z = self.pair(root)
            Image.open(x).save(y)
            result = audit(x, y, z, root / "out")
            self.assertFalse(result["passed"])
            self.assertIn("No makeup pixels", " ".join(result["errors"]))


if __name__ == "__main__":
    unittest.main()
