"""Synthetic material-compositing tests; not photographic quality evidence."""
from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np
from PIL import Image, ImageCms, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from render_material_look import render, validate_recipe


class MaterialLookTests(unittest.TestCase):
    def fixture(self, root: Path):
        root.mkdir(parents=True, exist_ok=True)
        w, h = 320, 420
        # Synthetic source with natural fine-scale luminance variation.
        rng = np.random.default_rng(4)
        texture = rng.integers(-8, 9, size=(h, w, 1), dtype=np.int16)
        base = np.clip(np.array([176, 124, 99]) + texture, 0, 255).astype(np.uint8)
        original = root / "master.png"
        Image.fromarray(base, "RGB").save(original)
        Image.new("L", (w, h), 0).save(root / "blank.png")
        lips = Image.new("L", (w, h), 0)
        ImageDraw.Draw(lips).ellipse((100, 248, 220, 275), fill=255)
        lips.save(root / "lips.png")
        liner = Image.new("L", (w, h), 0)
        ImageDraw.Draw(liner).polygon([(94, 155), (151, 159), (90, 158)], fill=255)
        liner.save(root / "liner.png")
        recipe = {
            "layers": [
                {"name": "lips", "mask": "lips.png", "pigment": "#a01825",
                 "opacity": 0.90, "feather_px": 1.8,
                 "texture_strength": 1.0, "finish": "matte"},
                {"name": "liner", "mask": "liner.png", "pigment": "#181212",
                 "opacity": 0.96, "feather_px": 0,
                 "texture_strength": 0.10, "finish": "matte"},
            ]
        }
        config = root / "hollywood.json"
        config.write_text(json.dumps(recipe), encoding="utf8")
        return original, config, recipe

    def test_two_cosmetic_materials_preserve_all_other_pixels(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            master, config, _ = self.fixture(root)
            out = root / "result"
            report = render(master, config, out)
            self.assertEqual(report["status"], "engineering-preflight-passed")
            self.assertFalse(report["approved_for_catalog"])
            self.assertEqual(report["changed_outside_cosmetic_mask"], 0)
            self.assertEqual(len(report["layers"]), 2)
            original = np.asarray(Image.open(master))
            output = np.asarray(Image.open(out / "material-render.png"))
            union = np.asarray(Image.open(out / "approved-region-union.png"))
            np.testing.assert_array_equal(original[union == 0], output[union == 0])
            self.assertTrue(np.any(original[union > 0] != output[union > 0]))
            saved = json.loads((out / "pixel-lock" / "audit.json").read_text())
            self.assertEqual(saved["changed_outside_mask_pixels"], 0)

    def test_texture_survives_within_pigmented_lips(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            master, config, _ = self.fixture(root)
            out = root / "render"
            render(master, config, out)
            src = np.asarray(Image.open(master).convert("RGB"), dtype=np.float32)
            edited = np.asarray(Image.open(out / "material-render.png").convert("RGB"), dtype=np.float32)
            # Source local luminance variation must not collapse to flat color.
            inside = np.asarray(Image.open(root / "lips.png")) > 0
            self.assertGreater(np.std(edited[..., 0][inside]), 0.7)
            self.assertGreater(np.std(src[..., 0][inside]), 0.7)

    def test_opaque_pigment_retains_broad_source_luminance_gradient(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            master, config, recipe = self.fixture(root)
            # Deliberately shade the lip region darker on image-left and
            # lighter on image-right, as natural studio lighting would.
            base = np.asarray(Image.open(master), dtype=np.float32).copy()
            width = base.shape[1]
            gains = np.linspace(0.63, 1.37, width, dtype=np.float32)
            base = np.clip(base * gains[None, :, None], 0, 255).astype(np.uint8)
            Image.fromarray(base, "RGB").save(master)
            recipe["layers"] = [recipe["layers"][0]]
            recipe["layers"][0]["opacity"] = 1.0
            recipe["layers"][0]["feather_px"] = 1.0
            config.write_text(json.dumps(recipe), encoding="utf8")
            render(master, config, root / "output")
            image = np.asarray(Image.open(root / "output" / "material-render.png"))
            dark = float(np.mean(image[256:268, 115:128, 0]))
            bright = float(np.mean(image[256:268, 191:204, 0]))
            self.assertGreater(bright - dark, 8.0, (dark, bright))

    def test_opt_in_v5_preserves_original_lip_relief_and_protected_pixels(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            master,config,recipe=self.fixture(root)
            recipe["layers"][0]["appearance_model"]="source-relief-v5"
            recipe["layers"][0]["tone"]=0.86
            config.write_text(json.dumps(recipe))
            report=render(master,config,root/"v5")
            self.assertEqual(report["changed_outside_cosmetic_mask"],0)
            self.assertEqual(report["layers"][0]["appearance_model"],"source-relief-v5")
            self.assertEqual(report["layers"][0]["tone"],0.86)
            original=np.asarray(Image.open(master))
            painted=np.asarray(Image.open(root/"v5"/"material-render.png"))
            allowed=np.asarray(Image.open(root/"v5"/"approved-region-union.png"))>0
            np.testing.assert_array_equal(original[~allowed],painted[~allowed])
            self.assertGreater(float(np.std(painted[256:266,120:195,0])),0.4)

    def test_v5_source_form_survives_even_at_full_pigment_opacity(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            master,config,recipe=self.fixture(root)
            source=np.asarray(Image.open(master),dtype=np.float32).copy()
            ramp=np.linspace(0.68,1.32,source.shape[1],dtype=np.float32)
            source=np.clip(source*ramp[None,:,None],0,255).astype(np.uint8)
            Image.fromarray(source,"RGB").save(master)
            recipe["layers"]=[recipe["layers"][0]]
            recipe["layers"][0].update(appearance_model="source-relief-v5",
                                       opacity=1.0,feather_px=1.0,tone=.8)
            config.write_text(json.dumps(recipe))
            render(master,config,root/"v5")
            rgb=np.asarray(Image.open(root/"v5"/"material-render.png"))
            dark=float(np.mean(rgb[256:266,118:130,0]))
            light=float(np.mean(rgb[256:266,191:202,0]))
            self.assertGreater(light-dark,10.0,(dark,light))

    def test_v5_finishes_use_only_source_attested_highlights(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            master,config,recipe=self.fixture(root)
            original=np.asarray(Image.open(master),dtype=np.uint8).copy()
            # Bright source detail on the lip; no invented source specular
            # location is supplied by a new portrait.
            original[260,160:171,:]=np.clip(original[260,160:171,:].astype(int)+60,0,255).astype("uint8")
            Image.fromarray(original,"RGB").save(master)
            recipe["layers"]=[recipe["layers"][0]]
            recipe["layers"][0].update(appearance_model="source-relief-v5",
                                       opacity=1.0,tone=.88,feather_px=1.0)
            recipe["layers"][0]["finish"]="matte"
            config.write_text(json.dumps(recipe))
            render(master,config,root/"matte")
            recipe["layers"][0]["finish"]="gloss"
            config.write_text(json.dumps(recipe))
            render(master,config,root/"gloss")
            matte=np.asarray(Image.open(root/"matte"/"material-render.png"))
            gloss=np.asarray(Image.open(root/"gloss"/"material-render.png"))
            self.assertFalse(np.array_equal(matte,gloss))
            np.testing.assert_array_equal(
                original[20:70,20:70],gloss[20:70,20:70]
            )

    def test_v5_rejects_unknown_model_and_nonfinite_tone(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            _,config,recipe=self.fixture(root)
            recipe["layers"][0]["appearance_model"]="unproven-neural-model"
            with self.assertRaisesRegex(ValueError,"appearance_model"):
                validate_recipe(recipe,root)
            recipe["layers"][0]["appearance_model"]="source-relief-v5"
            recipe["layers"][0]["tone"]=float("nan")
            with self.assertRaisesRegex(ValueError,"tone"):
                validate_recipe(recipe,root)

    def test_overlapping_region_masks_are_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            master, config, recipe = self.fixture(root)
            recipe["layers"][1]["mask"] = "lips.png"
            config.write_text(json.dumps(recipe))
            with self.assertRaisesRegex(ValueError, "overlap"):
                render(master, config, root / "result")

    def test_declared_liner_over_shadow_layers_are_ordered_and_source_locked(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            master, config, recipe = self.fixture(root)
            # The second transparent cosmetic pass overlaps the first, as
            # precise eyeliner must physically sit on top of the eyeshadow.
            recipe["layers"][1]["mask"] = "lips.png"
            recipe["layers"][1]["name"] = "second_pigment"
            recipe["layers"][1]["opacity"] = 0.35
            recipe["layers"][1]["allow_overlap"] = True
            config.write_text(json.dumps(recipe))
            report = render(master, config, root / "render")
            self.assertEqual(report["changed_outside_cosmetic_mask"], 0)
            self.assertGreater(report["layers"][1]["overlap_pixels_with_prior_layers"], 0)
            self.assertFalse(report["approved_for_catalog"])
            edited = np.asarray(Image.open(root / "render" / "material-render.png"))
            original = np.asarray(Image.open(master))
            self.assertTrue(np.array_equal(edited[20:60, 20:60], original[20:60, 20:60]))

    def test_non_opaque_source_is_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            master, config, _ = self.fixture(root)
            with Image.open(master) as image:
                rgba = image.convert("RGBA")
            rgba.putpixel((5, 5), (176, 124, 99, 0))
            rgba.save(master)
            with self.assertRaisesRegex(ValueError, "Non-opaque"):
                render(master, config, root / "result")

    def test_masks_must_fit_source_and_stay_off_border(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            master, config, _ = self.fixture(root)
            Image.new("L", (300, 420), 255).save(root / "lips.png")
            with self.assertRaisesRegex(ValueError, "expected"):
                render(master, config, root / "result")
            Image.new("L", (320, 420), 255).save(root / "lips.png")
            with self.assertRaisesRegex(ValueError, "border"):
                render(master, config, root / "result")

    def test_binary_mask_fades_to_zero_at_inside_boundary(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            master, config, recipe = self.fixture(root)
            recipe["layers"] = [recipe["layers"][0]]
            recipe["layers"][0]["feather_px"] = 5
            config.write_text(json.dumps(recipe))
            render(master, config, root / "result")
            source = np.asarray(Image.open(master))
            done = np.asarray(Image.open(root / "result" / "material-render.png"))
            # The ellipse's topmost pixel is immediately adjacent to the
            # protected area: it must match source, not a 50%-opacity halo.
            self.assertTrue(np.array_equal(source[248, 160], done[248, 160]))
            self.assertFalse(np.array_equal(source[262, 160], done[262, 160]))

    def test_embedded_srgb_icc_is_preserved(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            master, config, _ = self.fixture(root)
            profile = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
            with Image.open(master) as im:
                im.save(master, icc_profile=profile)
            result = render(master, config, root / "render")
            with Image.open(root / "render" / "material-render.png") as im:
                self.assertEqual(im.info.get("icc_profile"), profile)
            self.assertTrue(result["embedded_srgb_profile_preserved"])

    def test_wide_gamut_or_unexpected_icc_is_blocked(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            master, config, _ = self.fixture(root)
            profile = ImageCms.ImageCmsProfile(ImageCms.createProfile("LAB")).tobytes()
            with Image.open(master) as im:
                im.save(master, icc_profile=profile)
            with self.assertRaisesRegex(ValueError, "must be sRGB"):
                render(master, config, root / "result")

    def test_premium_rejects_small_or_upsampled_proxy(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            master, config, _ = self.fixture(root)
            with self.assertRaisesRegex(ValueError, "Premium candidate"):
                render(master, config, root / "result", premium=True)

    def test_invalid_pigment_and_nonfinite_alpha_are_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            _, config, recipe = self.fixture(root)
            recipe["layers"][0]["pigment"] = "lipstick-red"
            config.write_text(json.dumps(recipe))
            with self.assertRaisesRegex(ValueError, "pigment"):
                validate_recipe(json.loads(config.read_text()), root)
            recipe["layers"][0]["pigment"] = "#b81d35"
            recipe["layers"][0]["opacity"] = float("nan")
            with self.assertRaisesRegex(ValueError, "opacity"):
                validate_recipe(recipe, root)

    def test_previous_success_is_removed_when_new_recipe_is_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            master, config, recipe = self.fixture(root)
            out = root / "result"
            render(master, config, out)
            self.assertTrue((out / "material-render.png").exists())
            recipe["layers"][0]["mask"] = "blank.png"
            config.write_text(json.dumps(recipe))
            with self.assertRaisesRegex(ValueError, "empty"):
                render(master, config, out)
            self.assertFalse((out / "material-render.png").exists())
            self.assertFalse((out / "material-render-report.json").exists())
            self.assertFalse((out / "approved-region-union.png").exists())
            self.assertFalse((out / "pixel-lock" / "audit.json").exists())

    def test_mask_path_escape_is_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            _, config, recipe = self.fixture(root)
            recipe["layers"][0]["mask"] = "../outside.png"
            config.write_text(json.dumps(recipe))
            with self.assertRaisesRegex(ValueError, "outside recipe folder"):
                validate_recipe(recipe, root)


if __name__ == "__main__":
    unittest.main()
