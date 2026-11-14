#!/usr/bin/env python3
"""Create SAME-PHOTO MediaPipe face mesh metadata entirely offline.

Never pass user/customer photographs to GitHub or CI. Landmark files
identify the subject's facial geometry and must remain private/local.

  python -m pip install mediapipe pillow numpy
  python scripts/quality/detect_source_face.py \
    --photo /private/approved-bare-master.png \
    --out /private/face-landmarks.json

The face_landmarker.task weights already ship in H-Beauty. Mediapipe Tasks
does NOT return a numeric per-face detection-confidence score; this exporter
reports the ACTUAL configured minimum confidence thresholds instead of
inventing a measured probability.
"""
from __future__ import annotations

import argparse
from hashlib import sha256
import json
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_TASK = ROOT / "public/tryon/face_landmarker.task"
THRESHOLD = 0.80


def build_payload(
    file_bytes: bytes,
    width: int,
    height: int,
    points: list[list[float]],
    *,
    min_face_detection_confidence: float,
    min_face_presence_confidence: float,
    face_count: int,
) -> dict[str, Any]:
    if face_count != 1:
        raise ValueError(f"Expected precisely ONE face, got {face_count}")
    if len(points) < 468:
        raise ValueError(f"Detected only {len(points)} facial landmarks, need >=468")
    if min_face_detection_confidence < THRESHOLD or min_face_presence_confidence < THRESHOLD:
        raise ValueError("Source face model used insufficient detection thresholds")
    if not width > 0 or not height > 0:
        raise ValueError("Invalid source image dimensions")
    a = np.asarray(points, dtype=np.float64)
    if a.shape != (len(points), 2) or not np.isfinite(a).all():
        raise ValueError("Malformed or non-finite MediaPipe landmarks")
    # A few forehead landmarks might land fractionally beyond an image
    # boundary on unusual poses: reject instead of silently clipping.
    if np.any(a < 0.0) or np.any(a > 1.0):
        raise ValueError("Face landmarks outside the source image")
    return {
        "coordinate_space": "normalized",
        "face_count": 1,
        "dimensions": [width, height],
        "source_sha256": sha256(file_bytes).hexdigest(),
        "detection_policy": {
            "framework": "mediapipe.tasks.vision.FaceLandmarker",
            "running_mode": "IMAGE",
            "min_face_detection_confidence": float(min_face_detection_confidence),
            "min_face_presence_confidence": float(min_face_presence_confidence),
            "reported_per_face_confidence_available": False,
        },
        "landmark_count": len(points),
        "points": points,
        "visual_review": "pending",
        "contains_sensitive_facial_geometry": True,
        "catalog_release_approved": False,
    }


def detect(photo: Path, task: Path = DEFAULT_TASK) -> dict[str, Any]:
    try:
        import mediapipe as mp
    except ImportError as exc:
        raise RuntimeError(
            "MediaPipe is required locally; run python -m pip install mediapipe"
        ) from exc
    if not task.is_file():
        raise FileNotFoundError(f"Local FaceLandmarker model missing: {task}")
    raw = photo.read_bytes()
    with Image.open(photo) as original:
        # Source SHA and pixels must refer to the same exact orientation.
        # Explicitly normalize rotated EXIF sources into a lossless PNG
        # before running both the detector and the renderer.
        orientation = original.getexif().get(274, 1)
        if orientation not in (None, 1):
            raise ValueError("Rotate the photograph into upright lossless PNG before face detection")
        rgb = np.ascontiguousarray(np.asarray(original.convert("RGB")), dtype=np.uint8)
    h, w = rgb.shape[:2]
    base = mp.tasks.BaseOptions(model_asset_path=str(task))
    options = mp.tasks.vision.FaceLandmarkerOptions(
        base_options=base,
        running_mode=mp.tasks.vision.RunningMode.IMAGE,
        num_faces=1,
        min_face_detection_confidence=THRESHOLD,
        min_face_presence_confidence=THRESHOLD,
        min_tracking_confidence=THRESHOLD,
    )
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    with mp.tasks.vision.FaceLandmarker.create_from_options(options) as detector:
        result = detector.detect(mp_image)
    if len(result.face_landmarks) != 1:
        raise ValueError(
            f"One reliably detected face is required; got {len(result.face_landmarks)}"
        )
    points = [[float(p.x), float(p.y)] for p in result.face_landmarks[0]]
    return build_payload(
        raw, w, h, points, face_count=1,
        min_face_detection_confidence=THRESHOLD,
        min_face_presence_confidence=THRESHOLD,
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--photo", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--model", type=Path, default=DEFAULT_TASK)
    args = parser.parse_args()
    data = detect(args.photo, args.model)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf8"
    )
    print(
        f"Detected {data['landmark_count']} landmarks for exact {data['dimensions']} "
        f"photo; saved private local file {args.out}. No photos uploaded."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
