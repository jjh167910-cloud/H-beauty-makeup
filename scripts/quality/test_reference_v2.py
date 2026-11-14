#!/usr/bin/env python3
"""Unit tests for V2 reference-pack and non-destructive candidate gates.

All images below are GENERATED SYNTHETIC TEST FIXTURES. They are NOT models,
genuine bare-face photographs, or evidence of H-Beauty photorealism.
"""
from __future__ import annotations

from hashlib import sha256
import json
from pathlib import Path
import tempfile
import unittest
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prepare_reference_v2 import PILOTS, generate, parse_styles, validate


class ReferenceV2KitTests(unittest.TestCase):
    def test_42_recipe_briefs_and_four_pilots(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp)
            manifest = generate(p)
            self.assertEqual(manifest["reference_image_count"], 43)
            self.assertEqual(len(manifest["styles"]), 42)
            self.assertEqual(len(list((p / "prompts").glob("*.txt"))), 43)
            self.assertEqual(set(manifest["pilots"]), set(PILOTS))
            self.assertEqual(len(set(s["id"] for s in manifest["styles"])), 42)
            hollywood = (p / "prompts" / "hollywood.txt").read_text("utf8")
            self.assertIn("#b3242f", hollywood)
            self.assertIn("precise winged eyeliner", hollywood)
            self.assertIn("bare-reference.png", hollywood)
            rhinestone = (p / "prompts" / "rhinestone.txt").read_text("utf8")
            self.assertIn("rhinestones", rhinestone)
            self.assertIn("RIGHT of the image", rhinestone)
            electric = (p / "prompts" / "electric-blue.txt").read_text("utf8")
            self.assertIn("CHEEKS: no added blush.", electric)
            self.assertNotIn("Blush color", electric)
            natural = (p / "prompts" / "no-makeup.txt").read_text("utf8")
            self.assertIn("EYELINER: no eyeliner.", natural)
            self.assertNotIn("Natural dark liner if", natural)

    def test_missing_authentic_master_fails_without_crashing(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            report = validate(out / "absent", "pilot", out / "result")
            self.assertFalse(report["passed_structural_check"])
            self.assertFalse(report["approved_for_production"])
            self.assertIn("MISSING MASTER", " ".join(report["errors"]))

    def make_fixture(self, directory: Path):
        directory.mkdir(parents=True, exist_ok=True)
        face = Image.new("RGB", (2048, 2732), (132, 106, 88))
        face.save(directory / "bare-reference.png")
        master_hash = sha256((directory / "bare-reference.png").read_bytes()).hexdigest()
        (directory / "bare-reference.json").write_text(
            json.dumps({
                "source_kind": "original_cosmetic_free_photograph",
                "no_makeup_review": "approved",
                "usage_rights_review": "approved",
                "review_record_id": "SYNTHETIC-UNIT-TEST-NOT-REAL-PROVENANCE",
                "native_width": 2048, "native_height": 2732,
                "master_sha256": master_hash,
            }), encoding="utf8"
        )
        (directory / "styles").mkdir(exist_ok=True)
        (directory / "masks").mkdir(exist_ok=True)
        for style_id in PILOTS:
            edited = face.copy()
            draw = ImageDraw.Draw(edited)
            mask = Image.new("L", face.size, 0)
            # Arbitrary lipstick-colored patch for TESTING ONLY, no real person.
            # Mask must cover exactly the pixels the synthetic paint is allowed to change.
            bounds = (430, 1250, 760, 1400)
            draw.ellipse(bounds, fill=(159, 45, 70))
            ImageDraw.Draw(mask).ellipse(bounds, fill=255)
            mask.save(directory / "masks" / (style_id + ".png"))
            edited.save(directory / "styles" / (style_id + ".png"))
            (directory / "styles" / (style_id + ".json")).write_text(
                json.dumps({"style_id": style_id,
                            "source_sha256": master_hash,
                            "visual_review": "approved",
                            "reference_is_cosmetic_free": True}), encoding="utf8"
            )

    def test_pilot_fixture_passes_structural_checks_but_not_production_approval(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.make_fixture(root / "candidate")
            report = validate(root / "candidate", "pilot", root / "output")
            self.assertTrue(report["passed_structural_check"], report["errors"])
            self.assertFalse(report["approved_for_production"])
            self.assertEqual(report["checked"], 4)

    def test_hair_drift_and_unmodified_makeup_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            candidate = root / "candidate"
            self.make_fixture(candidate)
            with Image.open(candidate / "styles" / "hollywood.png") as photo:
                altered = photo.copy()
            draw = ImageDraw.Draw(altered)
            draw.rectangle((1780, 1600, 1960, 2080), fill=(242, 235, 230))
            altered.save(candidate / "styles" / "hollywood.png")
            with Image.open(candidate / "bare-reference.png") as photo:
                untouched = photo.copy()
            untouched.save(candidate / "styles" / "rhinestone.png")
            report = validate(candidate, "pilot", root / "out")
            self.assertFalse(report["passed_structural_check"])
            by_id = {item["id"]: item for item in report["styles"]}
            self.assertIn("hair changed", " ".join(by_id["hollywood"]["issues"]))
            self.assertIn("pixel-identical", " ".join(by_id["rhinestone"]["issues"]))

    def test_missing_cosmetic_mask_blocks_pilot_promotion(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            candidate = root / "candidate"
            self.make_fixture(candidate)
            (candidate / "masks" / "electric-blue.png").unlink()
            report = validate(candidate, "pilot", root / "result")
            self.assertFalse(report["passed_structural_check"])
            by_id = {item["id"]: item for item in report["styles"]}
            self.assertIn("missing cosmetic-change mask", by_id["electric-blue"]["issues"])

    def test_changed_protected_background_blocks_pilot_promotion(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            candidate = root / "candidate"
            self.make_fixture(candidate)
            photo = candidate / "styles" / "hollywood.png"
            with Image.open(photo) as original:
                edited = original.copy()
            edited.putpixel((15, 15), (1, 2, 3))
            edited.save(photo)
            report = validate(candidate, "pilot", root / "result")
            self.assertFalse(report["passed_structural_check"])
            by_id = {item["id"]: item for item in report["styles"]}
            self.assertEqual(by_id["hollywood"]["pixel_lock"]["changed_outside_mask_pixels"], 1)

    def test_master_source_metadata_cannot_certify_synthetic_demakeup(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            candidate = root / "candidate"
            self.make_fixture(candidate)
            path = candidate / "bare-reference.json"
            info = json.loads(path.read_text("utf8"))
            info["source_kind"] = "synthetic_demakeup"
            path.write_text(json.dumps(info), encoding="utf8")
            report = validate(candidate, "pilot", root / "result")
            self.assertFalse(report["passed_structural_check"])
            self.assertFalse(report["approved_for_production"])
            self.assertIn("exploratory only", " ".join(report["errors"]))

    def test_provenance_checksum_must_equal_bare_master(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            candidate = root / "candidate"
            self.make_fixture(candidate)
            path = candidate / "bare-reference.json"
            info = json.loads(path.read_text("utf8"))
            info["master_sha256"] = "f" * 64
            path.write_text(json.dumps(info), encoding="utf8")
            report = validate(candidate, "pilot", root / "result")
            self.assertFalse(report["passed_structural_check"])
            self.assertIn("checksum", " ".join(report["errors"]))

    def test_native_resolution_record_prevents_unreported_resize(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            candidate = root / "candidate"
            self.make_fixture(candidate)
            path = candidate / "bare-reference.json"
            info = json.loads(path.read_text("utf8"))
            info["native_width"], info["native_height"] = 900, 1200
            path.write_text(json.dumps(info), encoding="utf8")
            report = validate(candidate, "pilot", root / "result")
            self.assertFalse(report["passed_structural_check"])
            self.assertIn("upscale", " ".join(report["errors"]))

    def test_wrong_source_checksum_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            candidate = root / "candidate"
            self.make_fixture(candidate)
            info = candidate / "styles" / "electric-blue.json"
            meta = json.loads(info.read_text("utf8"))
            meta["source_sha256"] = "0" * 64
            info.write_text(json.dumps(meta), encoding="utf8")
            report = validate(candidate, "pilot", root / "out")
            self.assertFalse(report["passed_structural_check"])
            item = next(x for x in report["styles"] if x["id"] == "electric-blue")
            self.assertIn("master SHA256", " ".join(item["issues"]))


if __name__ == "__main__":
    unittest.main()
