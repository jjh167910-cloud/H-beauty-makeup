"""ONNX portability tests use only generated synthetic color patches.

No user face, original photo, private checkpoint or customer landmark is
stored in this repository or published as an Actions artifact.
"""
from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest

import numpy as np
import torch
from PIL import Image

from test_paired_dataset import collection_fixture
from prepare_paired_dataset import build
from train_opacity_carrier import train, ROOT
from export_opacity_onnx import export, FILENAME, MAX_PARITY_ERROR


class OpacityOnnxSmoke(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        torch.set_num_threads(min(2,torch.get_num_threads()))

    def fixture(self,root: Path):
        collection,_=collection_fixture(root/"pairs",6)
        index=root/"private-index.json"
        build(collection,index)
        training=root/"training"
        train(index,training,epochs=1,side=96,batch_size=2,seed=19)
        return training/"research-carrier-unapproved.pt",training

    def test_synthetic_model_exports_alpha_only_with_mask_exactness_and_parity(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            weights,_=self.fixture(root)
            folder=root/"onnx"
            report=export(weights,folder,parity_trials=5)
            self.assertEqual(report["status"],"research-onnx-parity-verified")
            self.assertFalse(report["approved_for_catalog"])
            self.assertFalse(report["deploy_to_app"])
            self.assertFalse(report["android_performance_verified"])
            self.assertFalse(report["trained_on_real_licensed_photos_verified"])
            self.assertEqual(report["fixed_crop_side"],96)
            self.assertLessEqual(report["max_alpha_parity_error"],MAX_PARITY_ERROR)
            self.assertEqual(report["input_names"],["source","mask","pigment","region"])
            self.assertEqual(report["output_names"],["alpha"])
            self.assertTrue((folder/FILENAME).exists())
            self.assertGreater((folder/FILENAME).stat().st_size,1000)
            self.assertEqual(len(json.loads((folder/"onnx-research-report.json").read_text())["warnings"]),5)
            self.assertEqual({x["case"] for x in report.get("parity",[])},set())
            self.assertGreaterEqual(report["cpu_onnxruntime_latency_ms_median"],0)

    def test_unapproved_checkpoint_provenance_is_mandatory(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            weights,folder=self.fixture(root)
            info=folder/"training-report.json"
            metadata=json.loads(info.read_text())
            metadata["catalog_approved"]=True
            info.write_text(json.dumps(metadata))
            with self.assertRaisesRegex(ValueError,"Training provenance"):
                export(weights,root/"bad",parity_trials=2)
            self.assertFalse((root/"bad"/FILENAME).exists())

    def test_rejected_rerun_cannot_leave_stale_onnx_weights_or_green_report(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            weights,_=self.fixture(root)
            folder=root/"onnx"
            export(weights,folder,parity_trials=2)
            self.assertTrue((folder/FILENAME).exists())
            weights.write_bytes(b"not-a-real-weights-file")
            with self.assertRaises(Exception):
                export(weights,folder,parity_trials=2)
            self.assertFalse((folder/FILENAME).exists())
            self.assertFalse((folder/"onnx-research-report.json").exists())

    def test_private_output_folder_is_required(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            weights,_=self.fixture(root)
            with self.assertRaisesRegex(ValueError,"public repository"):
                export(weights,ROOT/"DO-NOT-STORE-ONNX",parity_trials=2)


if __name__=="__main__":
    unittest.main()
