#!/usr/bin/env python3
"""Offline, source-locked cosmetic material compositor for V2 look research.

Unlike copying lipstick/eyeshadow pixels from a second regenerated face, this
renderer applies masked pigment directly to the SAME unmodified source photo.
It preserves source hair, background, wardrobe and uncovered skin bit-exactly.
Lips retain locally measured source luminance detail rather than being painted
as a flat opaque RGB patch. Independent lash/liner geometry must be supplied
by a separately quality-approved mask, NOT invented by this script.

Input example (JSON):
{
  "layers": [
    {"name": "lips", "mask": "lips.png", "pigment": "#a71825",
     "opacity": 0.92, "feather_px": 1.5,
     "texture_strength": 0.85, "finish": "matte"},
    {"name": "liner", "mask": "liner.png", "pigment": "#171111",
     "opacity": 0.96, "feather_px": 0,
     "texture_strength": 0.10, "finish": "matte"}
  ]
}

Run: python scripts/quality/render_material_look.py --master master.png \
     --recipe look.json --out staging/hollywood --premium

The script writes PNG plus a report and verifies protected-pixel identity.
It does NOT certify authenticity, correct masks, source native resolution,
artist-level realism, or a finished luxury reference. Keep this tool separate
from production until genuine paired images and review prove better quality.
"""
from __future__ import annotations

import argparse
from io import BytesIO
from hashlib import sha256
import json
import math
from pathlib import Path
import re

import numpy as np
from PIL import Image, ImageCms, ImageFilter

from audit_pixel_locked_look import audit as audit_pixel_lock, load_rgb
from compose_source_locked import mask_depth

HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
FINISHES = {"matte", "satin", "gloss", "metallic"}
MAX_MASK_FRACTION = 0.25
MAX_LAYERS = 18
DEFAULT_TEXTURE_BLUR_PX = 3.0


def srgb_to_linear(rgb: np.ndarray) -> np.ndarray:
    return np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(rgb: np.ndarray) -> np.ndarray:
    return np.where(rgb <= 0.0031308, 12.92 * rgb, 1.055 * np.maximum(rgb, 0.0) ** (1 / 2.4) - 0.055)


def hex_rgb(value: str) -> np.ndarray:
    if not isinstance(value, str) or not HEX.fullmatch(value):
        raise ValueError(f"Invalid RGB pigment hex: {value!r}")
    return np.array([int(value[i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float32) / 255.0


def parameter(value: object, name: str, minimum: float, maximum: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{name} must be a real number")
    result = float(value)
    if not math.isfinite(result) or not minimum <= result <= maximum:
        raise ValueError(f"{name} must be between {minimum} and {maximum}")
    return result


def validate_recipe(data: object, root: Path) -> list[dict]:
    if not isinstance(data, dict) or not isinstance(data.get("layers"), list):
        raise ValueError("Recipe requires a layers array")
    raw_layers = data["layers"]
    if not 1 <= len(raw_layers) <= MAX_LAYERS:
        raise ValueError(f"Recipe must contain 1-{MAX_LAYERS} cosmetic layers")
    seen = set()
    results = []
    for item in raw_layers:
        if not isinstance(item, dict):
            raise ValueError("Every layer must be a JSON object")
        name = item.get("name")
        if not isinstance(name, str) or not re.fullmatch(r"[a-z][a-z0-9_-]{1,40}", name):
            raise ValueError("Each layer requires a stable lowercase name")
        if name in seen:
            raise ValueError(f"Duplicate makeup layer: {name}")
        seen.add(name)
        mask_name = item.get("mask")
        if not isinstance(mask_name, str) or not mask_name.lower().endswith(".png"):
            raise ValueError(f"Layer {name}: expected a grayscale PNG mask")
        path = (root / mask_name).resolve()
        if not path.is_relative_to(root.resolve()) or not path.is_file():
            raise ValueError(f"Layer {name}: mask missing or outside recipe folder")
        finish = item.get("finish", "matte")
        if finish not in FINISHES:
            raise ValueError(f"Layer {name}: unknown finish {finish!r}")
        opacity = parameter(item.get("opacity", 0.85), f"{name}.opacity", 0.05, 1.0)
        feather = parameter(item.get("feather_px", 2.0), f"{name}.feather_px", 0.0, 20.0)
        texture = parameter(item.get("texture_strength", 0.75), f"{name}.texture_strength", 0.0, 1.5)
        appearance = item.get("appearance_model", "legacy")
        if appearance not in ("legacy", "source-relief-v5"):
            raise ValueError(f"{name}.appearance_model must be legacy or source-relief-v5")
        tone = parameter(item.get("tone", 1.0), f"{name}.tone", 0.5, 1.5)
        allow_overlap = item.get("allow_overlap", False)
        if not isinstance(allow_overlap, bool):
            raise ValueError(f"{name}.allow_overlap must be true or false")
        pigment = hex_rgb(item.get("pigment", ""))
        results.append({"name": name, "path": path, "finish": finish,
                        "opacity": opacity, "feather": feather,
                        "texture": texture, "allow_overlap": allow_overlap,
                        "appearance": appearance, "tone": tone,
                        "pigment": pigment})
    return results


def validated_srgb_profile(path: Path) -> bytes | None:
    """Reject wide-gamut or malformed ICC data before sRGB pigment math.

    The same pixel RGB values have different colors under AdobeRGB/Display P3.
    Preserving the original embedded sRGB profile prevents color-management
    regressions in otherwise unchanged face, background and clothing regions.
    Untagged input is assumed to be sRGB and remains untagged.
    """
    with Image.open(path) as im:
        raw = im.info.get("icc_profile")
    if not raw:
        return None
    try:
        profile = ImageCms.ImageCmsProfile(BytesIO(raw))
        name = ImageCms.getProfileName(profile).lower()
    except (OSError, ValueError, TypeError) as exc:
        raise ValueError(f"Invalid embedded ICC profile: {exc}") from exc
    if "srgb" not in name:
        raise ValueError(
            f"Source ICC profile must be sRGB, not {name.strip()!r}; "
            "convert source to sRGB using a color-managed conversion before rendering"
        )
    return raw


def prepare_mask(path: Path, size: tuple[int, int]) -> Image.Image:
    with Image.open(path) as f:
        f.verify()
    with Image.open(path) as f:
        if f.mode not in ("L", "1"):
            raise ValueError(f"{path.name}: cosmetic masks must be one-channel grayscale")
        if f.size != size:
            raise ValueError(f"{path.name}: expected {size}, got {f.size}")
        mask = f.convert("L")
    if not mask.getbbox():
        raise ValueError(f"{path.name}: cosmetic region is empty")
    return mask


def colorize_roi(source: np.ndarray, underlay: np.ndarray, weight: np.ndarray, pigment: np.ndarray,
                 texture_strength: float, finish: str, blur_px: float = DEFAULT_TEXTURE_BLUR_PX,
                 appearance: str = "legacy", tone: float = 1.0) -> np.ndarray:
    """Convert existing skin RGB to target cosmetic albedo while keeping texture.

    Input float image is in [0,1] *sRGB*. Mask is a float [0,1] coverage
    field. All high-frequency detail comes from SOURCE only.
    """
    linear_source = srgb_to_linear(source)
    source_luma = np.sum(linear_source * np.array([.2126, .7152, .0722], dtype=np.float32), axis=2)
    lum_img = Image.fromarray(np.clip(np.round(source_luma * 255), 0, 255).astype(np.uint8))
    blurred = np.asarray(lum_img.filter(ImageFilter.GaussianBlur(blur_px)), dtype=np.float32) / 255.0
    # Ratio isolates fine pores, lip creases and lighting details, bounded to
    # prevent amplification of low-light sensor noise into garish contrast.
    local_detail = np.clip((source_luma + 0.015) / (blurred + 0.015), 0.65, 1.45)
    # Preserve broad light and shadow *within* each cosmetic region as well
    # as fine texture. A near-constant illumination multiplier made lipstick
    # flatten into a uniform painted shape even when the source had realistic
    # lip relief. Normalize the blurred source luminance to the masked
    # median, so skin and lip highlights remain spatially anchored.
    active = weight > 0
    reference_luma = float(np.median(blurred[active])) if np.any(active) else float(np.median(blurred))
    illum = np.clip(((blurred + 0.045) / (reference_luma + 0.045)) ** 0.55, 0.66, 1.38)
    pigment_linear = srgb_to_linear(pigment)
    if appearance == "source-relief-v5":
        # Photographed source relief drives both broad (form/lighting) and
        # narrow (pores/creases) structure. The pigment supplies CHROMA,
        # not a spatially flat new lightness image. This avoids flattening
        # the original lip topography into one uniform lipstick rectangle.
        #
        # This is a controlled optical approximation, NOT measured spectral
        # pigment or physically correct BRDF. An unchanged source with no
        # glints cannot magically acquire photographed glassy lip reflections.
        pigment_luma = float(np.dot(pigment_linear, [.2126, .7152, .0722]))
        chroma = pigment_linear / max(0.015, pigment_luma)
        form = np.clip((blurred + .015) / (reference_luma + .015), .57, 1.55)
        detail = np.power(local_detail, texture_strength)
        # Geometric blending of pigment and source lightness avoids
        # making a dark red lipstick as bright as naked skin (which would
        # clip the red channel and look neon). Retain source form *relative*
        # to this exposure, never blindly copy the source's mean luminance.
        target_mean_luma = math.sqrt(
            max(reference_luma, .015) * max(pigment_luma, .015)
        )
        desired_luma = np.clip(
            target_mean_luma * tone * np.power(form, .88) * detail, 0, .95
        )
        target = desired_luma[..., None] * chroma.reshape(1, 1, 3)
        positive_source_glints = np.maximum(0, source_luma - blurred * 1.035)
        glint_scale = {"matte": .03, "satin": .23, "gloss": .70, "metallic": .35}[finish]
        target += positive_source_glints[..., None] * glint_scale
        target = np.clip(target, 0, 1)
    else:
        target = pigment_linear.reshape(1, 1, 3) * illum[..., None] * np.power(local_detail[..., None], texture_strength)

    if finish == "satin":
        # Do not create artificial highlights; retain a small share of source
        # specular response at the correct naturally photographed locations.
        target = target * 0.92 + linear_source * 0.08
    elif finish == "gloss":
        target = target * 0.84 + linear_source * 0.16
    elif finish == "metallic":
        # Metallic pigment is an appearance approximation; true reflectance
        # requires a learned material/specular map and independent validation.
        target = target * 0.80 + linear_source * 0.20
    target = np.clip(target, 0, 1)
    # The physical source supplies texture. The current canvas supplies
    # previous cosmetic pigment (e.g., liner above eyeshadow). Intentional
    # overlapping regions are explicitly declared and applied in JSON order.
    underlay_linear = srgb_to_linear(underlay)
    new_linear = underlay_linear * (1.0 - weight[..., None]) + target * weight[..., None]
    return np.clip(linear_to_srgb(new_linear), 0.0, 1.0)


def render(master_path: Path, recipe_path: Path, out: Path, premium: bool = False) -> dict:
    # Never return a stale passed artifact from a previous attempt.
    out.mkdir(parents=True, exist_ok=True)
    # Failed reruns must not leave a prior approved-looking image, union mask
    # or green pixel-lock report that can be mistaken for this candidate.
    for stale in (
        "material-render.png", "material-render-report.json", "approved-region-union.png",
        "pixel-lock/audit.json", "pixel-lock/allowed-region-mask.png",
        "pixel-lock/protected-differences.png",
    ):
        (out / stale).unlink(missing_ok=True)
    source = load_rgb(master_path)
    source_icc = validated_srgb_profile(master_path)
    layers = validate_recipe(json.loads(recipe_path.read_text(encoding="utf-8")), recipe_path.parent)
    w, h = source.size
    if premium and (w < 2048 or h < 2732 or abs(w / h - 0.75) > 0.005):
        raise ValueError(f"Premium candidate {w}x{h} fails native 2048x2732, 3:4 size gate")
    rgb = np.asarray(source, dtype=np.uint8)
    output = rgb.copy()
    occupied = np.zeros((h, w), dtype=np.bool_)
    layer_reports = []
    for spec in layers:
        mask = prepare_mask(spec["path"], source.size)
        box = mask.getbbox()
        assert box is not None
        x0, y0, x1, y1 = box
        if x0 < 4 or y0 < 4 or x1 > w - 4 or y1 > h - 4:
            raise ValueError(f"{spec['name']}: mask touches protected picture border")
        coverage = np.asarray(mask, dtype=np.uint8) > 0
        overlapping_pixels = int(np.count_nonzero(occupied & coverage))
        if overlapping_pixels and not spec["allow_overlap"]:
            raise ValueError(f"{spec['name']}: cosmetic regions overlap another layer; declare intentional overlap explicitly")
        occupied |= coverage
        # Work on a bounded ROI so 2048x2732 images do not require full-frame
        # floating-point copies and are practical on modest-memory hardware.
        margin = 12
        ax0, ay0 = max(0, x0 - margin), max(0, y0 - margin)
        ax1, ay1 = min(w, x1 + margin), min(h, y1 + margin)
        src_patch = rgb[ay0:ay1, ax0:ax1].astype(np.float32) / 255.0
        m_patch = np.asarray(mask.crop((ax0, ay0, ax1, ay1)), dtype=np.float32) / 255.0
        if spec["feather"] > 0:
            # GaussianBlur leaves ~50% coverage on a binary-mask boundary.
            # Clipping it to the mask creates a sharp 50% -> 0% step.
            # Erode inward to compute a true, zero-coverage boundary instead;
            # use smoothstep over the first N interior pixels.
            mask_patch = mask.crop((ax0, ay0, ax1, ay1))
            depth = mask_depth(
                mask_patch.point(lambda v: 255 if v > 0 else 0),
                math.ceil(spec["feather"])
            ).astype(np.float32)
            t = np.clip(depth / max(spec["feather"], 1.0), 0.0, 1.0)
            inward = 3.0 * t * t - 2.0 * t * t * t
            m_patch *= inward
        alpha = np.minimum(1.0, np.maximum(0.0, m_patch * spec["opacity"]))
        underlay_patch = output[ay0:ay1, ax0:ax1].astype(np.float32) / 255.0
        result_patch = colorize_roi(
            src_patch, underlay_patch, alpha, spec["pigment"], spec["texture"], spec["finish"],
            appearance=spec["appearance"], tone=spec["tone"]
        )
        new_pixels = np.rint(result_patch * 255).astype(np.uint8)
        active = m_patch > 0
        roi = output[ay0:ay1, ax0:ax1]
        roi[active] = new_pixels[active]
        layer_reports.append({
            "name": spec["name"],
            "finish": spec["finish"],
            "pigment_rgb": [int(x * 255 + .5) for x in spec["pigment"]],
            "opacity": spec["opacity"], "feather_px": spec["feather"],
            "texture_strength": spec["texture"],
            "appearance_model": spec["appearance"],
            "tone": spec["tone"],
            "allow_overlap": spec["allow_overlap"],
            "overlap_pixels_with_prior_layers": overlapping_pixels,
            "mask_sha256": sha256(spec["path"].read_bytes()).hexdigest(),
            "mask_coverage_percent": round(100 * coverage.mean(), 4),
        })
    occupied_count = int(occupied.sum())
    if occupied_count > w * h * MAX_MASK_FRACTION:
        raise ValueError(f"Cosmetic masks cover {occupied_count / (w * h):.1%}; maximum 25%")
    outside_changed = int(np.count_nonzero(np.any(output[~occupied] != rgb[~occupied], axis=1)))
    if outside_changed:
        raise AssertionError(f"Protected pixels changed: {outside_changed}")
    if not np.any(output[occupied] != rgb[occupied]):
        raise ValueError("No effective cosmetic pigment change produced")
    composite_path = out / "material-render.png"
    save_kwargs = {"icc_profile": source_icc} if source_icc else {}
    Image.fromarray(output, "RGB").save(composite_path, **save_kwargs)
    union_mask = out / "approved-region-union.png"
    Image.fromarray(occupied.astype(np.uint8) * 255, "L").save(union_mask)
    safety = audit_pixel_lock(master_path, composite_path, union_mask, out / "pixel-lock", premium=premium)
    if not safety["passed"]:
        composite_path.unlink(missing_ok=True)
        raise ValueError("Pixel-lock revalidation failed: " + "; ".join(safety["errors"]))
    report = {
        "status": "engineering-preflight-passed",
        "approved_for_catalog": False,
        "requires_artist_review": True,
        "original_camera_ground_truth": False,
        "source_master_sha256": sha256(master_path.read_bytes()).hexdigest(),
        "source_width": w, "source_height": h,
        "source_color_space": "sRGB" if source_icc else "sRGB-assumed-untagged",
        "embedded_srgb_profile_preserved": bool(source_icc),
        "composite_sha256": sha256(composite_path.read_bytes()).hexdigest(),
        "cosmetic_regions_percent": round(100 * occupied_count / (w * h), 4),
        "changed_outside_cosmetic_mask": outside_changed,
        "layers": layer_reports,
        "notes": [
            "This tool cannot invent accurate eyeliner/lash shapes; manually audited masks are required.",
            "Source skin pores and image geometry stay unchanged outside cosmetic masks.",
            "Photographic authenticity, native capture resolution and cosmetics realism are not automatically proven.",
            "Matte, satin and glossy approximations must be compared to real paired cosmetic photographs.",
        ],
    }
    (out / "material-render-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--master", required=True, type=Path)
    parser.add_argument("--recipe", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--premium", action="store_true")
    args = parser.parse_args()
    report = render(args.master, args.recipe, args.out, premium=args.premium)
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
