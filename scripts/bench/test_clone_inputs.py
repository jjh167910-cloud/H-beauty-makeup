"""Private benchmark triplet input-integrity tests using FAKE non-image bytes only."""
import json
import tempfile
import unittest
from pathlib import Path

from clone_inputs import REPO, copy_triplet


def fixture(seed: Path):
    looks = [f"look-{i}" for i in range(40)]
    photos = [
        {"id": "catalog__orig", "file": "photos/catalog__orig.png", "source": "catalog"},
        {"id": "catalog__warm", "file": "photos/catalog__warm.png", "source": "catalog"},
        {"id": "catalog__dim", "file": "photos/catalog__dim.png", "source": "catalog"},
        *[{"id": f"{tone}{i}", "file": f"photos/{tone}{i}.png", "source": "mste", "group": tone,
           "face": f"{tone}{i}", "cond": "orig"} for tone in ("light", "medium", "deep") for i in (1, 2)],
    ]
    seed.mkdir()
    (seed / "manifest.json").write_text(json.dumps(
        {"set": "looks", "looks": looks, "engines": ["v1"], "photos": photos}))
    (seed / "photos").mkdir()
    for p in photos:
        (seed / p["file"]).write_bytes(b"fake-test-pixel-source-" + p["id"].encode())
    for look in looks:
        sub = seed / "truth" / look
        sub.mkdir(parents=True)
        for p in photos[:3]:
            (sub / (p["id"] + ".png")).write_bytes(b"fake-test-reference-" + look.encode() + p["id"].encode())
    return looks, photos


class PrivateTripletTests(unittest.TestCase):
    def test_complete_triplet_is_byte_identical_and_resume_safe(self):
        with tempfile.TemporaryDirectory() as tmp:
            seed, root = Path(tmp) / "seed", Path(tmp) / "trial"
            looks, photos = fixture(seed)
            report = copy_triplet(seed, root)
            self.assertEqual(report["looks"], 40)
            self.assertEqual(report["photos"], 9)
            self.assertEqual(report["reference_images"], 40 * 3)
            for name in ("baseline", "repeat", "candidate"):
                dest = root / name
                self.assertEqual((dest / "manifest.json").read_bytes(), (seed / "manifest.json").read_bytes())
                self.assertEqual((dest / "photos/catalog__orig.png").read_bytes(),
                                 (seed / "photos/catalog__orig.png").read_bytes())
                self.assertTrue((dest / "truth/look-12/catalog__warm.png").is_file())
            (root / "baseline" / "renders").mkdir()
            (root / "baseline" / "renders" / "finished.txt").write_text("keep")
            self.assertEqual(copy_triplet(seed, root), report)
            self.assertTrue((root / "baseline" / "renders/finished.txt").is_file())

    def test_changed_source_is_never_silently_patched_into_resumed_run(self):
        with tempfile.TemporaryDirectory() as tmp:
            seed, root = Path(tmp) / "seed", Path(tmp) / "trial"
            fixture(seed)
            copy_triplet(seed, root)
            (seed / "photos/catalog__orig.png").write_bytes(b"mutated")
            with self.assertRaisesRegex(ValueError, "bytes differ"):
                copy_triplet(seed, root)
            self.assertNotEqual((root / "baseline/photos/catalog__orig.png").read_bytes(), b"mutated")

    def test_rejects_partial_quick_and_non_gpu_variants(self):
        with tempfile.TemporaryDirectory() as tmp:
            seed, root = Path(tmp) / "seed", Path(tmp) / "trial"
            fixture(seed)
            m = json.loads((seed / "manifest.json").read_text())
            m["set"] = "quick"
            (seed / "manifest.json").write_text(json.dumps(m))
            with self.assertRaisesRegex(ValueError, "full 40"):
                copy_triplet(seed, root)
            m["set"] = "looks"
            m["engines"] = ["v1", "v2"]
            (seed / "manifest.json").write_text(json.dumps(m))
            with self.assertRaisesRegex(ValueError, "engines v1"):
                copy_triplet(seed, root)

    def test_rejects_path_traversal_and_symlinks(self):
        with tempfile.TemporaryDirectory() as tmp:
            seed, root = Path(tmp) / "seed", Path(tmp) / "trial"
            fixture(seed)
            m = json.loads((seed / "manifest.json").read_text())
            m["photos"][0]["file"] = "photos/../../secrets.png"
            (seed / "manifest.json").write_text(json.dumps(m))
            with self.assertRaisesRegex(ValueError, "Unsafe"):
                copy_triplet(seed, root)
            m["photos"][0]["file"] = "photos/catalog__orig.png"
            (seed / "manifest.json").write_text(json.dumps(m))
            (seed / "photos/catalog__orig.png").unlink()
            (seed / "photos/catalog__orig.png").symlink_to(seed / "manifest.json")
            with self.assertRaisesRegex(ValueError, "symlinked"):
                copy_triplet(seed, root)

    def test_rejects_private_workspaces_inside_git_checkout(self):
        with tempfile.TemporaryDirectory() as tmp:
            seed = Path(tmp) / "seed"
            fixture(seed)
            with self.assertRaisesRegex(ValueError, "outside the Git checkout"):
                copy_triplet(seed, REPO / "scripts/bench/runs/no-photos-in-repo")


if __name__ == "__main__":
    unittest.main()
