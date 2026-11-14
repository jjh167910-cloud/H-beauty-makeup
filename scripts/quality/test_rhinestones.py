"""Rhinestone accessory tests use fictional flat-color fixtures, not beauty photos."""
from __future__ import annotations

from hashlib import sha256
import json
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np
from PIL import Image, ImageCms

sys.path.insert(0,str(Path(__file__).resolve().parent))
from render_rhinestones import render, recipe_check, stone_sprite


class RhinestoneAccessoryTests(unittest.TestCase):
    def fixture(self, root: Path):
        root.mkdir(parents=True,exist_ok=True)
        source=root/"unretouched-test-fixture.png"
        w,h=480,640
        # Source color variation simulates photographed local lighting; not
        # intended to resemble an actual human.
        a=np.zeros((h,w,3),dtype=np.uint8)
        for x in range(w):
            a[:,x,0]=np.uint8(153+x//30)
            a[:,x,1]=np.uint8(120+x//40)
            a[:,x,2]=np.uint8(112+x//45)
        Image.fromarray(a,"RGB").save(source)
        recipe={
            "style_id":"rhinestone",
            "source_sha256":sha256(source.read_bytes()).hexdigest(),
            "source_dimensions":[w,h],
            "allowed_skin_box":[.40,.30,.65,.40],
            "gems":[
                {"x":218,"y":216,"radius_px":3.6,"angle_deg":-10},
                {"x":247,"y":231,"radius_px":3.0,"angle_deg":12},
                {"x":267,"y":212,"radius_px":4.0,"angle_deg":28},
            ]
        }
        path=root/"accessories.json"
        path.write_text(json.dumps(recipe),encoding="utf8")
        return source,path,recipe

    def test_three_gems_modify_only_small_reviewed_patch(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            source,config,_=self.fixture(root)
            report=render(source,config,root/"out")
            self.assertEqual(report["gem_count"],3)
            self.assertFalse(report["approved_for_catalog"])
            self.assertEqual(report["changed_outside_mask_pixels"],0)
            self.assertGreater(report["changed_inside_mask_pixels"],40)
            self.assertLess(report["image_coverage_percent"],0.5)
            original=np.asarray(Image.open(source))
            after=np.asarray(Image.open(root/"out"/"rhinestone-accessories.png"))
            allowed=np.asarray(Image.open(root/"out"/"rhinestone-allowed-mask.png"))>0
            np.testing.assert_array_equal(original[~allowed],after[~allowed])
            self.assertTrue(np.any(original[allowed]!=after[allowed]))
            saved=json.loads((root/"out"/"rhinestone-qa.json").read_text())
            self.assertTrue(saved["requires_artist_review"])

    def test_facet_lighting_and_shadow_are_not_flat_white_emoji(self):
        gem=stone_sprite(5.0,-11,(171,130,105))
        p=np.asarray(gem)
        changed=p[p[...,3]>20]
        self.assertGreater(len(changed),50)
        # Reflective jewel should contain dark rim, silver facets and bright glints.
        self.assertGreater(int(changed[:,0].max())-int(changed[:,0].min()),90)
        self.assertGreater(len(np.unique(changed[:,:3],axis=0)),15)

    def test_wrong_photo_sha_rejected_before_writing(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            source,config,recipe=self.fixture(root)
            recipe["source_sha256"]="0"*64
            config.write_text(json.dumps(recipe))
            with self.assertRaisesRegex(ValueError,"SHA256"):
                render(source,config,root/"out")
            self.assertFalse((root/"out"/"rhinestone-accessories.png").exists())

    def test_stones_rejected_for_styles_without_accessory_brief(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            source,config,recipe=self.fixture(root)
            recipe["style_id"]="hollywood"
            config.write_text(json.dumps(recipe))
            with self.assertRaisesRegex(ValueError,"only"):
                render(source,config,root/"out")

    def test_too_large_or_outside_approved_temple_is_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            source,config,recipe=self.fixture(root)
            recipe["gems"][0]["x"]=20
            config.write_text(json.dumps(recipe))
            with self.assertRaisesRegex(ValueError,"outside"):
                render(source,config,root/"out")
            recipe["gems"][0]["x"]=218
            recipe["gems"][0]["radius_px"]=14
            config.write_text(json.dumps(recipe))
            with self.assertRaisesRegex(ValueError,"within"):
                render(source,config,root/"out")

    def test_duplicate_stone_positions_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            source,config,recipe=self.fixture(root)
            recipe["gems"][1]["x"]=recipe["gems"][0]["x"]
            recipe["gems"][1]["y"]=recipe["gems"][0]["y"]
            config.write_text(json.dumps(recipe))
            with self.assertRaisesRegex(ValueError,"collision"):
                render(source,config,root/"out")

    def test_no_old_success_survives_rejected_rerun(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            source,config,recipe=self.fixture(root)
            out=root/"out"
            render(source,config,out)
            self.assertTrue((out/"rhinestone-accessories.png").is_file())
            recipe["source_sha256"]="not-the-original"
            config.write_text(json.dumps(recipe))
            with self.assertRaisesRegex(ValueError,"SHA256"):
                render(source,config,out)
            self.assertFalse((out/"rhinestone-accessories.png").exists())
            self.assertFalse((out/"rhinestone-qa.json").exists())
            self.assertFalse((out/"rhinestone-allowed-mask.png").exists())

    def test_embedded_srgb_color_profile_survives_render(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            source,config,recipe=self.fixture(root)
            with Image.open(source) as im:
                profile=ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
                im.save(source,icc_profile=profile)
            recipe["source_sha256"]=sha256(source.read_bytes()).hexdigest()
            config.write_text(json.dumps(recipe))
            render(source,config,root/"out")
            with Image.open(root/"out"/"rhinestone-accessories.png") as im:
                self.assertEqual(im.info.get("icc_profile"),profile)

    def test_non_opaque_image_is_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            source,config,recipe=self.fixture(root)
            with Image.open(source) as im:
                rgba=im.convert("RGBA")
            rgba.putpixel((1,1),(1,1,1,0))
            rgba.save(source)
            recipe["source_sha256"]=sha256(source.read_bytes()).hexdigest()
            config.write_text(json.dumps(recipe))
            with self.assertRaisesRegex(ValueError,"Non-opaque"):
                render(source,config,root/"out")


if __name__=="__main__":
    unittest.main()
