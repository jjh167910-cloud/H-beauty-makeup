#!/usr/bin/env python3
"""Build a versioned 43-reference production pack from the actual style recipes.

The published app currently contains 42 STYLES, including 'no-makeup' (a subtle
makeup style). A genuinely bare-face MASTER is a separate 43rd reference.

Generate without any new photos:
    python scripts/quality/prepare_reference_v2.py generate --out catalog-v2-pack

Validate candidate edits in a separate staging directory (never live assets):
    python scripts/quality/prepare_reference_v2.py validate \
        --candidate-dir candidates/reference-v2 --phase pilot \
        --out catalog-v2-report

No network, generative APIs, or changes to deployed photos. The reviewer must
verify identity, absence of makeup in the master, and native resolution.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import re
import sys

from PIL import Image, ImageChops, ImageStat, UnidentifiedImageError
from audit_pixel_locked_look import audit as audit_pixel_lock

ROOT = Path(__file__).resolve().parents[2]
STYLES_FILE = ROOT / "src/data/makeup-styles.ts"
PILOTS = ("no-makeup", "hollywood", "electric-blue", "rhinestone")
EXAMPLE_SOURCE = "public/makeup/looks/no-makeup.webp"
STYLE_RE = re.compile(r'style\(\s*"([a-z0-9-]+)"\s*,\s*"([^"]+)"\s*,\s*\{([^{}]+)\}\s*\)', re.S)
VERSION = "reference-v2.1-premium"
# A quality target, NOT permission to upscale a smaller photo into invented detail.
MIN_NATIVE_WIDTH, MIN_NATIVE_HEIGHT = 2048, 2732
ASPECT_RATIO = 3 / 4
ASPECT_TOLERANCE = 0.005
ALLOWED_MASTER_SOURCE = "original_cosmetic_free_photograph"

SKIN = {
    "sheer": "a very light, translucent, natural skin finish; preserve visible real pores and natural complexion",
    "matte": "an even but not plastic-looking matte foundation; retain skin's natural microtexture",
    "dewy": "a controlled luminous/dewy foundation, with natural specular highlights",
    "glow": "a luminous complexion with spatially localized highlights, not a blurred or oily face",
    "bronzed": "a warmed, naturally bronzed complexion with believable contour gradients",
}
SHADOW = {
    "none": "no eyeshadow",
    "wash": "a subtle evenly blended eyeshadow wash",
    "crease": "a shaped eyeshadow concentrated in the eyelid crease, smoothly blended out",
    "cutcrease": "an accurately defined cut-crease with a crisp separation of lid and crease colors",
    "halo": "a halo eyeshadow layout with luminous center and deeper inner/outer zones",
    "smoky": "a precise graduated smoky eyeshadow, softened outward without muddy edges",
    "gradient": "a smooth two-shade gradient matched to the eye shape",
}
LINER = {
    "none": "no eyeliner",
    "thin": "a delicate thin eyeliner hugging the upper lash line",
    "wing": "a precise winged eyeliner with a crisp tapered tip",
    "fox": "elongated lifted fox-eye eyeliner, proportional to the original lid geometry",
    "double": "two separate precise eyeliner strokes",
    "graphic": "precisely drawn graphic editorial eyeliner, all curves clean and intentional",
    "puppy": "soft downward-tilted puppy eyeliner",
    "smudge": "smudged eyeliner blended close to the lashes, but not over the eyeball",
    "siren": "narrow elongated siren eyeliner with defined inner and outer corners",
}
LASHES = {
    "natural": "retain natural individual lashes, with only a subtle mascara effect",
    "volume": "separate individual lashes with visible extra volume and no clumped artifacts",
    "dramatic": "full dramatic lashes, retaining natural root placement, separation and correct eye geometry",
}
BROWS = {
    "natural": "retain the original brow shape and individual hairs",
    "bold": "well-defined fuller brows with realistic visible hairs and unaltered brow structure",
    "lifted": "subtly brushed-up brows, hair-by-hair texture; do not reshape their underlying anatomy",
    "thin": "thinly styled brows without inventing or changing facial bone structure",
}
BLUSH = {
    "none": "no added blush",
    "apples": "blush on the apples of the cheeks, softly blended into nearby skin",
    "high": "blush placed high along the upper cheekbone",
    "draped": "draped blush sweeping gently toward the temples",
    "nose": "blush across the upper cheeks and bridge of the nose",
    "under": "soft blush placed just beneath the eyes",
}
LIPS = {
    "matte": "fully pigmented matte lipstick with accurate lip contour and natural fine creases",
    "satin": "satin lipstick with natural lip shading and controlled soft highlights",
    "gloss": "glossy lipstick, convincing depth and specular highlights with visible lip texture",
    "ombre": "gradient/ombre lipstick with distinct inner-to-edge pigment",
    "lined": "defined lip liner transitioning naturally into the lipstick",
}
ACCENTS = {
    "shimmer": "subtle finely resolved reflective shimmer where the makeup recipe places it",
    "glitter": "fine individual cosmetic glitter particles reflecting light; do not spread onto unrelated areas",
    "rhinestones": "small realistic rhinestones exactly on the specified cosmetic placement, with true reflections and shadows",
    "freckles": "sparse realistic freckles only in the requested cosmetic placement",
    "contour": "naturally shaded contour matching the face's actual bone structure",
    "lowerLiner": "precisely drawn liner near the lower lash line",
    "bottomLashes": "individual defined lower lashes with plausible roots and lengths",
    "aegyo": "subtle aegyo-sal under-eye highlight and contour without altering identity",
}

MASTER_RULES = (
    "Use ONLY the separately approved genuinely cosmetic-free original master "
    "bare-reference.png as the image to edit. NEVER start from the catalog's "
    "finished no-makeup.webp style or from a previously generated makeup look. "
    "This is exact image editing, NOT a new portrait: preserve the same adult "
    "woman's facial identity, unaltered face proportions, eyes and iris pattern, "
    "nose, lips, skin undertone, skin pores and natural expression. Preserve "
    "the exact head tilt, camera position, crop, image dimensions, hair roots, "
    "individual strands, eyebrows outside permitted cosmetics, earrings, "
    "wardrobe, ambient light direction, exposure, background, and all "
    "non-cosmetic pixels as closely as image editing permits. "
    "Do not perform generalized beauty retouching or blur skin texture. "
    "Do not change teeth, teeth visibility, glasses, hands, or clothes. "
    "Output one standalone portrait, not a grid or contact sheet. "
    "No text, watermark, frame, unrelated jewelry, or extra accessories."
)

MASTER_BRIEF = (
    "Create or obtain a truly cosmetic-free PORTRAIT SOURCE from a licensed, "
    "original photographic session. No foundation, concealer, cheek pigment, "
    "bronzer, highlighter, brow makeup, mascara, false eyelashes, eyeshadow, "
    "eyeliner, lipstick, lip gloss or lip liner. Keep natural brow and lash "
    "hairs, naturally varying lip color, skin pores, freckles, natural skin "
    "discoloration and expression. The existing no-makeup.webp is visibly "
    "wearing cosmetics and cannot be accepted as the neutral master. "
    "Removing makeup by generative editing yields an estimated de-makeup "
    "candidate, NOT photographic ground truth; independent visual approval "
    "of a genuine bare source is still required."
)


def field(body: str, key: str, required: bool = True) -> str | None:
    m = re.search(r"\b" + re.escape(key) + r'\s*:\s*"([^"]+)"', body)
    if not m and required:
        raise ValueError(f"Missing style field {key} in: {body[:130]}")
    return m.group(1) if m else None


def parse_styles() -> list[dict]:
    text = STYLES_FILE.read_text("utf8")
    items = STYLE_RE.findall(text)
    if len(items) != 42:
        raise ValueError(f"Expected 42 style definitions, got {len(items)}")
    result = []
    for style_id, title, body in items:
        lid = re.search(r'\blid\s*:\s*\[\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\]', body)
        if not lid:
            raise ValueError(f"Missing lid colors for {style_id}")
        m = re.search(r"\baccents\s*:\s*\[([^\]]*)\]", body)
        accents = re.findall(r'"([^"]+)"', m.group(1)) if m else []
        item = {"id": style_id, "title_fa": title, "skin": field(body, "skin"),
                "shadow": field(body, "shadow"),
                "lid_colors": [lid.group(1), lid.group(2)],
                "liner": field(body, "liner"),
                "liner_color": field(body, "linerColor", False),
                "lashes": field(body, "lashes"), "brow": field(body, "brow"),
                "blush": field(body, "blush"), "blush_color": field(body, "blushColor"),
                "lip_finish": field(body, "lip"), "lip_color": field(body, "lipColor"),
                "accents": accents,
                "pilot": style_id in PILOTS,
                "source_photo": "bare-reference.png",
                "target_photo": f"styles/{style_id}.png",
                "existing_reference": f"public/makeup/looks/{style_id}.webp",
                "review": {"visual_identity": "pending",
                           "makeup_fidelity": "pending",
                           "noncosmetic_preservation": "pending",
                           "artist_signoff": "pending"}}
        for name, mapping in (("skin", SKIN), ("shadow", SHADOW),
                              ("liner", LINER), ("lashes", LASHES),
                              ("brow", BROWS), ("blush", BLUSH),
                              ("lip_finish", LIPS)):
            if item[name] not in mapping:
                raise ValueError(f"Unexpected {style_id}.{name}: {item[name]}")
        if any(accent not in ACCENTS for accent in accents):
            raise ValueError(f"Unexpected accents for {style_id}: {accents}")
        result.append(item)
    ids = [x["id"] for x in result]
    if len(ids) != len(set(ids)) or set(PILOTS) - set(ids):
        raise ValueError("Duplicate style ID or missing pilot")
    return result


def prompt(item: dict) -> str:
    pilot_notes = {
        "no-makeup": "Make a subtle FINISHED makeup look: translucent base, almost imperceptible lid wash, natural mascara and tinted lip gloss. It is NOT the true neutral master.",
        "hollywood": "Classic old-Hollywood definition: a symmetric, crisp tapered wing, elegant neutral lid, separated dark lashes, strong matte red lips with clean lip lines.",
        "electric-blue": "Saturated cobalt-blue eyelids and blue graphic wing must be visually distinctive without painting on the sclera, brows or cheek.",
        "rhinestone": "As in the current catalog style, add only a few small pale reflective rhinestones near the outer corner of the eye on the RIGHT of the image (model's left eye), not all over the face. Use realistic tiny shadows and reflections.",
    }
    details = [
        f"STYLE: {item['id']} / {item['title_fa']}",
        "PRIMARY IMAGE TO EDIT: the verified bare-reference.png only. If the old catalog "
        "photo is provided as a second visual STYLE GUIDE, use it for cosmetic placement "
        "only; never copy its face geometry, lighting, hair or background.",
        "Make these exact cosmetic changes ONLY:",
        f"SKIN: {SKIN[item['skin']]}.",
        ("EYELIDS: no added eyeshadow." if item["shadow"] == "none" else
         f"EYELIDS: {SHADOW[item['shadow']]}, using inner/lid {item['lid_colors'][0]} "
         f"and outer/crease {item['lid_colors'][1]}."),
        ("EYELINER: no eyeliner." if item["liner"] == "none" else
         f"EYELINER: {LINER[item['liner']]}. " +
         (f"Pigment {item['liner_color']}." if item["liner_color"] else "Use realistic soft black/brown pigment.")),
        f"LASHES: {LASHES[item['lashes']]}.",
        f"BROWS: {BROWS[item['brow']]}.",
        ("CHEEKS: no added blush." if item["blush"] == "none" else
         f"CHEEKS: {BLUSH[item['blush']]}. Blush color {item['blush_color']}."),
        f"LIPS: {LIPS[item['lip_finish']]}. Lip color {item['lip_color']}.",
        ("ADDITIONAL COSMETIC ACCENTS: " + "; ".join(ACCENTS[x] for x in item["accents"]))
        if item["accents"] else "NO additional cosmetic accents or jewelry.",
        "Both eyes must have equivalent finished makeup appropriate to the unchanged three-quarter perspective.",
        "Edges of liners and lip products must be sharp at natural photo resolution.",
        "Keep skin pores, pores' directional shadows, lip creases and individual lashes visible.",
        "The listed hex colors define the intended product pigments, but must be rendered under the ORIGINAL camera lighting, not as flat RGB overlays.",
        *(["PILOT-SPECIFIC PRECISION: " + pilot_notes[item["id"]]] if item["id"] in pilot_notes else []),
        "Do not apply an extra accessory that is not explicitly mentioned in the style recipe.",
        MASTER_RULES,
    ]
    return "\n".join(details) + "\n"


def generate(out: Path) -> dict:
    styles = parse_styles()
    out.mkdir(parents=True, exist_ok=True)
    (out / "prompts").mkdir(exist_ok=True)
    (out / "prompts" / "00-bare-reference.txt").write_text(
        MASTER_BRIEF + "\n", encoding="utf8"
    )
    for style in styles:
        (out / "prompts" / (style["id"] + ".txt")).write_text(prompt(style), encoding="utf8")
    manifest = {
        "version": VERSION,
        "source": "src/data/makeup-styles.ts",
        "mode": "staged-and-not-live",
        "cosmetic_free_master": {
            "path": "bare-reference.png",
            "provenance_path": "bare-reference.json",
            "status": "missing-until-original-unretouched-cosmetic-free-photo-is-reviewed",
            "must_be_distinct_from": EXAMPLE_SOURCE,
            "ground_truth_required": True,
            "min_native_resolution": [MIN_NATIVE_WIDTH, MIN_NATIVE_HEIGHT],
            "aspect_ratio": "3:4",
            "source_kind_required": ALLOWED_MASTER_SOURCE,
            "synthetic_demakeup_is_ground_truth": False,
        },
        "style_count": len(styles),
        "reference_image_count": len(styles) + 1,
        "pilots": list(PILOTS),
        "style_recipe_sha256": sha256(STYLES_FILE.read_bytes()).hexdigest(),
        "release_approved": False,
        "styles": styles,
    }
    (out / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf8"
    )
    (out / "bare-reference-provenance-TEMPLATE.json").write_text(
        json.dumps({
            "source_kind": "UNVERIFIED",
            "no_makeup_review": "pending",
            "usage_rights_review": "pending",
            "review_record_id": "",
            "native_width": 0,
            "native_height": 0,
            "master_sha256": "REPLACE_WITH_SHA256_OF_APPROVED_BARE_REFERENCE_PNG"
        }, ensure_ascii=False, indent=2) + "\n", encoding="utf8"
    )
    lines = [
        "# H-Beauty — Reference V2 pilot production pack", "",
        "The current catalog is **not modified** by this pack.",
        "43 photographic references are needed: one *truly bare* master + 42 finished styles.",
        "For highest-quality V2 promotion, master must be an authentic, approved", 
        "cosmetic-free photograph at native minimum 2048x2732 (3:4) or higher; no upscaling.",
        "Supply bare-reference.json using bare-reference-provenance-TEMPLATE.json.",
        "Synthetic de-makeup remains a research candidate, never certified photo ground truth.",
        "The existing no-makeup.webp is a makeup style and **cannot** be used as the neutral master.",
        "A synthetic de-makeup image cannot be certified as a true photographic bare-face source.",
        "",
        "Four pilot looks: " + ", ".join(PILOTS),
        "",
        "Each style has a detailed, recipe-derived prompt under prompts/.",
        "Every prompt starts from the SAME approved bare image, never a preceding look.",
        "Exact original framing, hair, lighting, natural skin and identity are mandatory.",
        "Pilot candidates are rejected if they alter non-cosmetic pixels or obscure real skin texture.",
        "",
        "Run candidate validation in a separate staging directory:",
        "",
        "    python scripts/quality/prepare_reference_v2.py validate --candidate-dir candidates/reference-v2 --phase pilot --out quality-v2-result",
        "",
        "This validation is structural and photometric; artist review remains mandatory.",
    ]
    (out / "README.md").write_text("\n".join(lines) + "\n", encoding="utf8")
    return manifest


def read_rgb(path: Path) -> Image.Image:
    with Image.open(path) as p:
        p.verify()
    with Image.open(path) as p:
        return p.convert("RGB")


def crop(img: Image.Image, fractions: tuple[float, float, float, float]) -> Image.Image:
    w, h = img.size
    x0, y0, x1, y1 = fractions
    return img.crop((round(x0 * w), round(y0 * h), round(x1 * w), round(y1 * h)))


def delta(a: Image.Image, b: Image.Image) -> float:
    return round(sum(ImageStat.Stat(ImageChops.difference(a, b)).mean) / 3.0, 2)


def validate(candidate_dir: Path, phase: str, out: Path) -> dict:
    generate(out / "production-pack")
    styles = parse_styles()
    needed = PILOTS if phase == "pilot" else tuple(s["id"] for s in styles)
    master_path = candidate_dir / "bare-reference.png"
    errors, warnings, checked = [], [], []
    master_metadata = candidate_dir / "bare-reference.json"
    if not master_metadata.is_file():
        errors.append("MISSING PROVENANCE: bare-reference.json with independently reviewed original capture details")
        master_info = None
    else:
        try:
            master_info = json.loads(master_metadata.read_text("utf8"))
            if not isinstance(master_info, dict):
                raise ValueError("metadata must be an object")
            if master_info.get("source_kind") != ALLOWED_MASTER_SOURCE:
                errors.append("Neutral source is not a verified original cosmetic-free photograph; de-makeup edits are exploratory only")
            if master_info.get("no_makeup_review") != "approved":
                errors.append("Original bare-face photo has not passed human no-cosmetics review")
            if master_info.get("usage_rights_review") != "approved":
                errors.append("Original bare-face photo usage rights have not been reviewed")
            if not master_info.get("review_record_id"):
                errors.append("Missing human review record identifier for the authentic bare master")
            if not isinstance(master_info.get("native_width"), int) or not isinstance(master_info.get("native_height"), int):
                errors.append("Bare photo native width/height provenance missing")
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            errors.append(f"Invalid bare-reference.json: {exc}")
            master_info = None
    if not master_path.is_file():
        errors.append("MISSING MASTER: bare-reference.png not supplied in staging folder")
        master = None
        master_hash = None
    else:
        try:
            master = read_rgb(master_path)
            master_hash = sha256(master_path.read_bytes()).hexdigest()
            if master.width < MIN_NATIVE_WIDTH or master.height < MIN_NATIVE_HEIGHT:
                errors.append(f"Master {master.size} is smaller than premium native {MIN_NATIVE_WIDTH}x{MIN_NATIVE_HEIGHT} target")
            if abs(master.width / master.height - ASPECT_RATIO) > ASPECT_TOLERANCE:
                errors.append(f"Master {master.size} has incorrect 3:4 catalog aspect ratio")
            if master_info and (master_info.get("native_width"), master_info.get("native_height")) != master.size:
                errors.append("Bare master PNG dimensions do not match the recorded original native capture (potential resize/upscale)")
            if master_info and master_info.get("master_sha256") != master_hash:
                errors.append("Bare master PNG checksum does not match approved source provenance")
            # Spot the mistake where the current 'no-makeup' style is copied
            # directly as the new allegedly bare source.
            current_style = (ROOT / EXAMPLE_SOURCE)
            if current_style.is_file():
                old = read_rgb(current_style)
                if master.size == old.size and master.tobytes() == old.tobytes():
                    errors.append("Master is pixel-identical to the made-up no-makeup.webp")
        except (OSError, ValueError, UnidentifiedImageError) as exc:
            errors.append(f"Unreadable master: {exc}")
            master, master_hash = None, None

    for item in styles:
        if item["id"] not in needed:
            continue
        style_id = item["id"]
        photo = candidate_dir / "styles" / (style_id + ".png")
        meta = candidate_dir / "styles" / (style_id + ".json")
        detail = {"id": style_id, "image": str(photo), "issues": [], "metrics": {}}
        if not photo.is_file():
            detail["issues"].append("missing image")
        if not meta.is_file():
            detail["issues"].append("missing provenance JSON")
        if photo.is_file() and master is not None:
            try:
                edited = read_rgb(photo)
                if edited.size != master.size:
                    detail["issues"].append(f"mismatched image size {edited.size} vs {master.size}")
                elif edited.tobytes() == master.tobytes():
                    detail["issues"].append("style is pixel-identical to bare master; no cosmetic appearance added")
                else:
                    # Photometric heuristics: these zones MAY contain flyaway hair,
                    # light variations etc. Flags require expert review; they do
                    # not prove the edit is wrong.
                    zones = {
                        "background_corner": (0.005, 0.005, 0.045, 0.055),
                        "hair_lower_left": (0.005, 0.78, 0.12, 0.96),
                        "hair_right": (0.83, 0.53, 0.96, 0.87),
                        "eyes": (0.10, 0.23, 0.70, 0.44),
                        "lips": (0.20, 0.53, 0.61, 0.70),
                    }
                    for key, zone in zones.items():
                        detail["metrics"][key] = delta(crop(edited, zone), crop(master, zone))
                    if detail["metrics"]["background_corner"] > 8:
                        detail["issues"].append("background changed: visual review required")
                    if max(detail["metrics"]["hair_lower_left"], detail["metrics"]["hair_right"]) > 12:
                        detail["issues"].append("hair changed: visual review required")
            except (OSError, ValueError, UnidentifiedImageError) as exc:
                detail["issues"].append(f"unreadable image: {exc}")
        # Every V2 style must include an explicitly approved, same-grid cosmetic
        # mask. The look may not change even ONE pixel of hair/clothing/background.
        # Pixel equality is necessary, never sufficient for visual approval.
        mask_path = candidate_dir / "masks" / (style_id + ".png")
        if not mask_path.is_file():
            detail["issues"].append("missing cosmetic-change mask")
        elif photo.is_file() and master is not None:
            try:
                pixel_lock = audit_pixel_lock(
                    master_path, photo, mask_path,
                    out / "pixel-lock" / style_id, premium=True
                )
                detail["pixel_lock"] = {
                    "passed": pixel_lock["passed"],
                    "mask_coverage_percent": pixel_lock.get("allowed_coverage_percent"),
                    "changed_outside_mask_pixels": pixel_lock.get("changed_outside_mask_pixels"),
                }
                if not pixel_lock["passed"]:
                    detail["issues"].extend(
                        "pixel-lock: " + problem for problem in pixel_lock["errors"]
                    )
            except (OSError, ValueError) as exc:
                detail["issues"].append(f"invalid cosmetic-change mask: {exc}")
        if meta.is_file() and master_hash:
            try:
                provenance = json.loads(meta.read_text("utf8"))
                if provenance.get("style_id") != style_id:
                    detail["issues"].append("provenance style_id mismatch")
                if provenance.get("source_sha256") != master_hash:
                    detail["issues"].append("NOT edited from the exact approved master SHA256")
                if provenance.get("visual_review") != "approved":
                    detail["issues"].append("visual artist approval missing")
                if not provenance.get("reference_is_cosmetic_free", False):
                    detail["issues"].append("bare source not confirmed cosmetic-free")
            except (OSError, ValueError, json.JSONDecodeError) as exc:
                detail["issues"].append(f"invalid provenance JSON: {exc}")
        checked.append(detail)
    flagged = [item for item in checked if item["issues"]]
    if flagged:
        errors.append(f"{len(flagged)} of {len(needed)} requested styles have missing/failed checks")
    # A green structural report cannot authenticate a real skin/makeup result.
    warnings.append("MANUAL BLOCKER: verify face identity, natural skin texture, precise cosmetics and genuine bare-photo provenance")
    result = {"version": VERSION, "phase": phase, "candidate_dir": str(candidate_dir),
              "checked": len(checked), "target": len(needed), "approved_for_production": False,
              "passed_structural_check": not errors, "errors": errors, "notes": warnings,
              "styles": checked}
    out.mkdir(parents=True, exist_ok=True)
    (out / "validation.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf8"
    )
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    cmd = parser.add_subparsers(dest="command", required=True)
    make = cmd.add_parser("generate", help="Build all recipe-derived prompts without changing live photos")
    make.add_argument("--out", type=Path, default=ROOT / "catalog-v2-production-pack")
    val = cmd.add_parser("validate", help="Inspect isolated V2 candidate images and source provenance")
    val.add_argument("--candidate-dir", type=Path, required=True)
    val.add_argument("--phase", choices=("pilot", "full"), default="pilot")
    val.add_argument("--out", type=Path, default=ROOT / "catalog-v2-validation")
    args = parser.parse_args()
    if args.command == "generate":
        report = generate(args.out)
        print(f"Generated {report['reference_image_count']} production briefs, "
              f"{len(report['pilots'])} pilot styles at {args.out}")
        return 0
    report = validate(args.candidate_dir, args.phase, args.out)
    print(f"Checked {report['checked']} {args.phase} styles; "
          f"structural pass={report['passed_structural_check']}")
    for issue in report["errors"]:
        print("ERROR:", issue, file=sys.stderr)
    return 0 if report["passed_structural_check"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
