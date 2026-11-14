"""Only synthetic color blocks: no personal photographs or consent documents."""
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
from extract_paired_transparency import extract, linear_to_srgb, srgb_to_linear
from prepare_paired_dataset import build, verify_record


def collection_fixture(root: Path, count=8):
    records=[]
    root.mkdir(parents=True,exist_ok=True)
    for idx in range(count):
        folder=root/f"sample_{idx:02}"
        folder.mkdir(parents=True)
        rng=np.random.default_rng(idx+19)
        arr=np.clip(np.array([160+idx,125,100],dtype=np.int16)
                    +rng.integers(-16,17,size=(320,320,1)),0,255).astype(np.uint8)
        region=np.zeros((320,320),dtype=np.uint8)
        region[182:217,116:202]=255
        alpha=(region.astype(np.float32)/255)*(.48+idx*.015)
        source_linear=srgb_to_linear(arr.astype(np.float32)/255)
        red=srgb_to_linear(np.array([160,30,48],dtype=np.float32)/255)
        observed=(1-alpha[...,None])*source_linear+alpha[...,None]*red
        target=np.clip(np.round(linear_to_srgb(observed)*255),0,255).astype(np.uint8)
        a=folder/"bare.png";b=folder/"lipstick.png";m=folder/"mask.png"
        Image.fromarray(arr,"RGB").save(a)
        Image.fromarray(target,"RGB").save(b)
        Image.fromarray(region,"L").save(m)
        training={
            "schema_version":1,"pair_id":f"subject{idx:03}-lips-001",
            "source":"bare.png","target":"lipstick.png","mask":"mask.png",
            "source_sha256":sha256(a.read_bytes()).hexdigest(),
            "target_sha256":sha256(b.read_bytes()).hexdigest(),
            "region":"lips","pigment":"#a01e30","alignment_reviewed":True,
            "rights_scope":"commercial-model-training",
            "rights_document_id":"SYNTHETIC_FIXTURE_NO_LICENSE",
            "consent_document_id":"SYNTHETIC_FIXTURE_NO_PERSON",
            "rights_reviewed_by":"SYNTHETIC_TEST",
        }
        pair=folder/"pair.json"
        pair.write_text(json.dumps(training),encoding="utf8")
        result=folder/"extraction"
        extract(pair,result)
        records.append({
            "pair_id":training["pair_id"],
            "subject_id":f"subject{idx:03}",
            "session_id":f"session{idx:03}",
            "region":"lips","pigment":"#a01e30",
            "source":str(a.relative_to(root)),
            "target":str(b.relative_to(root)),
            "mask":str(m.relative_to(root)),
            "alpha":str((result/"makeup-alpha.png").relative_to(root)),
            "report":str((result/"extraction-report.json").relative_to(root)),
            "rights_verified_by":"SYNTHETIC_ONLY",
            "consent_verified_by":"SYNTHETIC_ONLY",
            "license_record_ref":"NO_REAL_LICENSE_SYNTHETIC",
            "consent_record_ref":"NO_REAL_CONSENT_SYNTHETIC",
        })
    collection=root/"collection.json"
    collection.write_text(json.dumps({"schema_version":1,"records":records}),encoding="utf8")
    return collection,records


class PairedDatasetTests(unittest.TestCase):
    def test_subject_disjoint_splits_and_all_pairs_reverified(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            collection,records=collection_fixture(root)
            index=build(collection,root/"model"/"dataset-index.json")
            self.assertTrue(index["subject_disjoint"])
            self.assertFalse(index["commercial_rights_independently_verified"])
            self.assertFalse(index["model_promoted"])
            self.assertEqual(len(index["records"]),8)
            self.assertEqual(set(index["subject_counts"]),{"train","val","test"})
            self.assertTrue(all(x>0 for x in index["subject_counts"].values()))
            split_sets={}
            for name in ("train","val","test"):
                split_sets[name]={r["subject_id"] for r in index["records"]
                                  if r["split"]==name}
            self.assertFalse(split_sets["train"] & split_sets["test"])
            self.assertFalse(split_sets["val"] & split_sets["test"])
            self.assertFalse(split_sets["train"] & split_sets["val"])
            self.assertEqual(index["records"][0]["rights_status"],
                             "self-attested-private-human-review")
            second=build(collection,root/"model"/"repeated.json")
            self.assertEqual(index["records"],second["records"])

    def test_minimum_distinct_subject_count(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            c,_=collection_fixture(root,5)
            with self.assertRaisesRegex(ValueError,"at least 6 distinct"):
                build(c,root/"index.json")

    def test_missing_rights_and_unsafe_file_paths_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);c,records=collection_fixture(root,6)
            entry=dict(records[0]);entry.pop("consent_verified_by")
            with self.assertRaisesRegex(ValueError,"consent_verified_by"):
                verify_record(root,entry)
            entry=dict(records[0]);entry["source"]="../escape.png"
            with self.assertRaisesRegex(ValueError,"private relative path"):
                verify_record(root,entry)

    def test_modified_photo_and_alpha_leakage_are_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);c,records=collection_fixture(root,6)
            entry=records[0]
            alpha_path=root/entry["alpha"]
            with Image.open(alpha_path) as im:
                alpha=np.array(im)
            alpha[4,4]=255
            Image.fromarray(alpha,"L").save(alpha_path)
            with self.assertRaisesRegex(ValueError,"protected face"):
                verify_record(root,entry)
            entry=records[1]
            photo=root/entry["source"]
            with Image.open(photo) as im:
                arr=np.array(im)
            arr[12,12]=(255,255,255)
            Image.fromarray(arr,"RGB").save(photo)
            with self.assertRaisesRegex(ValueError,"checksum"):
                verify_record(root,entry)

    def test_repeated_source_across_claimed_different_subjects_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);c,records=collection_fixture(root,6)
            # Deliberately mislabel same actual pair as a different person,
            # with a distinct pair ID and rights metadata. This must not
            # allow leakage between train and test via fake IDs.
            other=dict(records[0])
            other["subject_id"]="different-subject"
            other["session_id"]="different-session"
            other["pair_id"]=records[0]["pair_id"]
            records.append(other)
            c.write_text(json.dumps({"schema_version":1,"records":records}))
            with self.assertRaisesRegex(ValueError,"Repeated pair"):
                build(c,root/"index.json")

    def test_substituted_opacity_label_fails_real_reconstruction_check(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            _,records=collection_fixture(root,6)
            row=records[0]
            alpha_path=root/row["alpha"]
            mask=np.asarray(Image.open(root/row["mask"]))>0
            altered=np.zeros(mask.shape,dtype=np.uint8)
            altered[mask]=255
            Image.fromarray(altered,"L").save(alpha_path)
            with self.assertRaisesRegex(ValueError,"TRAINING-LABEL-RECONSTRUCTION-FAIL"):
                verify_record(root,row)

    def test_unreviewed_extraction_cannot_be_training_label(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);c,records=collection_fixture(root,6)
            report=root/records[0]["report"]
            data=json.loads(report.read_text())
            data["status"]="not-a-validated-pair"
            report.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError,"No successful"):
                verify_record(root,records[0])


if __name__=="__main__":
    unittest.main()
