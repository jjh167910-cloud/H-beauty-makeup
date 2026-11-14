"""One-epoch synthetic smoke: proves interface/safety, NOT makeup realism."""
from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np
import torch

sys.path.insert(0,str(Path(__file__).resolve().parent))
from test_paired_dataset import collection_fixture
from prepare_paired_dataset import build
from train_opacity_carrier import (
    OpacityCarrier, masked_composite, PairedOpacityDataset, train,
)


class OpacityTrainerTests(unittest.TestCase):
    def setUp(self):
        torch.set_num_threads(2)

    def test_model_can_never_repaint_non_cosmetic_pixels(self):
        net=OpacityCarrier(base=8).eval()
        source=torch.rand(1,3,96,96)
        mask=torch.zeros(1,1,96,96)
        mask[:,:,31:58,25:69]=1
        pigment=torch.tensor([.65,.1,.12]).view(1,3,1,1)
        region=torch.tensor([1.,0.,0.]).view(1,3,1,1)
        with torch.no_grad():
            alpha=net(source,mask,pigment,region)
            after=masked_composite(source,pigment,alpha,mask)
        self.assertEqual(alpha.shape,(1,1,96,96))
        self.assertTrue(torch.all(alpha[mask==0]==0))
        # Exact equality outside cosmetics, even in float space.
        self.assertTrue(torch.equal(
            source[(mask==0).expand_as(source)],
            after[(mask==0).expand_as(source)]
        ))

    def test_synthetic_subject_disjoint_train_val_test_and_report(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            collection,_=collection_fixture(root/"private-data",6)
            index_file=root/"private-data"/"index.json"
            build(collection,index_file)
            for split in ("train","val","test"):
                ds=PairedOpacityDataset(index_file,split,96)
                sample=ds[0]
                self.assertEqual(len(sample),6)
                self.assertEqual(sample[0].shape,(3,96,96))
                self.assertEqual(sample[2].shape,(1,96,96))
                self.assertTrue(torch.all(sample[3][sample[2]==0]==0))
            out=root/"private-model"
            report=train(index_file,out,epochs=1,side=96,batch_size=2)
            self.assertEqual(report["status"],"research-trained-unapproved")
            self.assertFalse(report["catalog_approved"])
            self.assertFalse(report["deploy_to_live_app"])
            self.assertTrue((out/"research-carrier-unapproved.pt").exists())
            self.assertEqual(report["epochs"],1)
            self.assertTrue(np.isfinite(report["heldout_test"]["alpha_mae"]))
            self.assertTrue(np.isfinite(report["heldout_test"]["render_rgb_mae"]))

    def test_training_rejects_forged_subject_disjoint_flag(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            collection,_=collection_fixture(root/"private-data",6)
            index_file=root/"private-data"/"index.json"
            dataset=build(collection,index_file)
            original=next(x for x in dataset["records"] if x["split"]=="train")
            moved=next(x for x in dataset["records"] if x["split"]=="test")
            moved["subject_id"]=original["subject_id"]
            index_file.write_text(json.dumps(dataset),encoding="utf8")
            with self.assertRaisesRegex(ValueError,"Person leakage"):
                PairedOpacityDataset(index_file,"train",96)

    def test_training_rejects_same_photo_with_forged_different_subject(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            collection,_=collection_fixture(root/"private-data",6)
            index_file=root/"private-data"/"index.json"
            dataset=build(collection,index_file)
            original=next(x for x in dataset["records"] if x["split"]=="train")
            moved=next(x for x in dataset["records"] if x["split"]=="test")
            moved["source_sha256"]=original["source_sha256"]
            index_file.write_text(json.dumps(dataset),encoding="utf8")
            with self.assertRaisesRegex(ValueError,"Identical photo leakage"):
                PairedOpacityDataset(index_file,"train",96)

    def test_training_rechecks_tampered_labels(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            collection,_=collection_fixture(root/"private-data",6)
            index_file=root/"private-data"/"index.json"
            index=build(collection,index_file)
            selected=next(x for x in index["records"] if x["split"]=="train")
            target=root/"private-data"/selected["files"]["alpha"]
            data=target.read_bytes()+b"\x00"
            target.write_bytes(data)
            ds=PairedOpacityDataset(index_file,"train",96)
            i=next(i for i,e in enumerate(ds.entries) if e["pair_id"]==selected["pair_id"])
            with self.assertRaisesRegex(ValueError,"hash changed"):
                ds[i]


if __name__=="__main__":
    unittest.main()
