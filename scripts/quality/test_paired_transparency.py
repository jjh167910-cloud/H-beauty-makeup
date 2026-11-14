"""Synthetic paired cosmetic carrier tests: NO real user faces or legal records."""
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
from extract_paired_transparency import extract, srgb_to_linear, linear_to_srgb


class PairedTransparencyTests(unittest.TestCase):
    def fixture(self, root: Path):
        root.mkdir(parents=True,exist_ok=True)
        h,w=540,420
        rng=np.random.default_rng(7)
        # Artificial color texture, not a human face.
        src=np.clip(
            np.array([174,130,108],dtype=np.int16)
            +rng.integers(-15,16,size=(h,w,1)),0,255
        ).astype(np.uint8)
        m=np.zeros((h,w),dtype=np.uint8)
        m[315:364,155:276]=255
        yy,xx=np.mgrid[:h,:w]
        alpha=np.clip(.46+.18*np.sin((xx-155)/13)+.11*np.cos((yy-315)/8),.05,.9)
        alpha*=m/255
        pigment=np.array([160,30,48],dtype=np.float32)/255
        source_lin=srgb_to_linear(src.astype(np.float32)/255)
        pigment_lin=srgb_to_linear(pigment)
        target_lin=(1-alpha[...,None])*source_lin+alpha[...,None]*pigment_lin
        target=np.clip(np.round(linear_to_srgb(target_lin)*255),0,255).astype("uint8")
        source=root/"source.png"
        after=root/"target.png"
        mask=root/"cosmetics.png"
        Image.fromarray(src,"RGB").save(source)
        Image.fromarray(target,"RGB").save(after)
        Image.fromarray(m,"L").save(mask)
        data={
            "schema_version":1,
            "pair_id":"synthetic-lips-test-001",
            "source":"source.png",
            "target":"target.png",
            "mask":"cosmetics.png",
            "source_sha256":sha256(source.read_bytes()).hexdigest(),
            "target_sha256":sha256(after.read_bytes()).hexdigest(),
            "region":"lips",
            "pigment":"#a01e30",
            "alignment_reviewed":True,
            "rights_scope":"commercial-model-training",
            "rights_document_id":"SYNTHETIC_FIXTURE_NO_RIGHTS_NEEDED",
            "consent_document_id":"SYNTHETIC_FIXTURE_NO_SUBJECT",
            "rights_reviewed_by":"SYNTHETIC_TEST_NOT_HUMAN",
        }
        manifest=root/"pair.json"
        manifest.write_text(json.dumps(data,indent=2),encoding="utf8")
        return source,after,mask,manifest,data

    def test_known_linear_makeup_alpha_is_recovered_with_small_error(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            source,target,mask,manifest,_=self.fixture(root)
            out=root/"result"
            result=extract(manifest,out)
            self.assertEqual(result["status"],"training-pair-engineering-preflight-only")
            self.assertFalse(result["release_approved"])
            self.assertFalse(result["trained_model_available"])
            self.assertFalse(result["rights_human_verified_by_software"])
            self.assertLess(result["reconstruction_inside_mae_rgb"],1.7)
            self.assertLess(result["reconstruction_inside_p95_max_rgb"],4)
            self.assertEqual(result["mean_pair_drift_outside_mask_rgb"],0)
            rgba=np.asarray(Image.open(out/"makeup-rgba.png"))
            a=np.asarray(Image.open(out/"makeup-alpha.png"))
            m=np.asarray(Image.open(mask))>0
            self.assertEqual(rgba.shape,(540,420,4))
            self.assertEqual(int(np.count_nonzero(a[~m])),0)
            self.assertGreater(float(np.mean(a[m])),60)
            np.testing.assert_array_equal(rgba[:,:,3],a)
            original=np.asarray(Image.open(source))
            recon=np.asarray(Image.open(out/"reconstructed-on-source.png"))
            np.testing.assert_array_equal(original[~m],recon[~m])
            self.assertGreater(int(np.count_nonzero(original[m]!=recon[m])),20)

    def test_reject_identity_or_background_drift_outside_cosmetics(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            _,target,_,manifest,data=self.fixture(root)
            with Image.open(target) as im:
                altered=im.convert("RGB")
            # Large non-makeup area changes simulate head movement/lighting.
            a=np.array(altered)
            a[40:190,35:200]=(28,42,55)
            Image.fromarray(a,"RGB").save(target)
            data["target_sha256"]=sha256(target.read_bytes()).hexdigest()
            manifest.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError,"PAIR-REGISTRATION-FAIL"):
                extract(manifest,root/"rejected")
            self.assertFalse((root/"rejected"/"makeup-rgba.png").exists())

    def test_reject_unrepresentable_target_when_one_pigment_is_wrong(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            _,_,_,manifest,data=self.fixture(root)
            data["pigment"]="#103ec6"
            manifest.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError,"PAIR-TRANSPARENCY-FAIL"):
                extract(manifest,root/"out")

    def test_missing_rights_are_rejected_not_auto_inferred(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            _,_,_,manifest,data=self.fixture(root)
            data["rights_scope"]="unrestricted"
            manifest.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError,"rights"):
                extract(manifest,root/"out")
            data["rights_scope"]="commercial-model-training"
            data.pop("consent_document_id")
            manifest.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError,"consent_document_id"):
                extract(manifest,root/"out")

    def test_bad_pair_checksum_and_path_escape_are_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            _,_,_,manifest,data=self.fixture(root)
            data["source_sha256"]="0"*64
            manifest.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError,"sha256"):
                extract(manifest,root/"out")
            data["source_sha256"]="x"*64
            data["source"]="../escape.png"
            manifest.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError,"escapes"):
                extract(manifest,root/"out")

    def test_invalid_masks_and_native_2k_gate(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            _,_,mask,manifest,_=self.fixture(root)
            with self.assertRaisesRegex(ValueError,"Native 2K"):
                extract(manifest,root/"out",min_native=True)
            Image.new("RGB",(420,540),"red").save(mask)
            with self.assertRaisesRegex(ValueError,"grayscale"):
                extract(manifest,root/"out")

    def test_rejected_rerun_deletes_previous_success(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            _,_,_,manifest,data=self.fixture(root)
            out=root/"output"
            extract(manifest,out)
            self.assertTrue((out/"makeup-rgba.png").is_file())
            data["target_sha256"]="0"*64
            manifest.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError,"sha256"):
                extract(manifest,out)
            self.assertFalse((out/"makeup-alpha.png").exists())
            self.assertFalse((out/"makeup-rgba.png").exists())
            self.assertFalse((out/"extraction-report.json").exists())


if __name__=="__main__":
    unittest.main()
