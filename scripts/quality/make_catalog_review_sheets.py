#!/usr/bin/env python3
"""Create small, readable before/after review sheets for existing 42 looks.

No regeneration is performed. The left-hand portrait is the CURRENT
no-makeup.webp style, which visibly contains cosmetics and is NOT a true
makeup-free master. Sheets are for visual auditing, never V2 ground truth.

    python scripts/quality/make_catalog_review_sheets.py --out catalog-review-sheets
"""
from __future__ import annotations

import argparse
from math import ceil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

from prepare_reference_v2 import ROOT, parse_styles

DIR = ROOT / "public/makeup/looks"
BASE = DIR / "no-makeup.webp"

BG = "#f5f3ef"
TEXT = "#262527"
MUTED = "#66636a"
BORDER = "#dcd7d2"


def font(size: int):
    for path in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    ):
        if Path(path).is_file():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def image(path: Path, dims: tuple[int, int]):
    with Image.open(path) as loaded:
        photo = loaded.convert("RGB")
    return ImageOps.contain(photo, dims, Image.Resampling.LANCZOS)


def generate(out: Path, per_sheet: int = 6) -> int:
    out.mkdir(parents=True, exist_ok=True)
    styles = parse_styles()
    if not BASE.is_file():
        raise FileNotFoundError(str(BASE))
    card_w, card_h = 640, 460
    cols, rows = 2, ceil(per_sheet / 2)
    title_h, bottom = 104, 48
    for offset in range(0, len(styles), per_sheet):
        batch = styles[offset:offset + per_sheet]
        board = Image.new("RGB", (card_w * cols, card_h * rows + title_h + bottom), BG)
        draw = ImageDraw.Draw(board)
        number = 1 + offset // per_sheet
        draw.text((28, 18), f"H-BEAUTY  |  CATALOG QUALITY REVIEW  |  {number:02d}",
                  font=font(26), fill=TEXT)
        draw.text((28, 57),
                  "LEFT: old 'no-makeup' style (NOT bare)    RIGHT: existing catalog look",
                  font=font(18), fill=MUTED)
        for idx, item in enumerate(batch):
            x = (idx % cols) * card_w + 14
            y = (idx // cols) * card_h + title_h + 8
            draw.rounded_rectangle((x, y, x + card_w - 28, y + card_h - 12),
                                   radius=14, outline=BORDER, width=2, fill="#ffffff")
            draw.text((x + 18, y + 12), f"{offset + idx + 1:02d} / {item['id']}",
                      font=font(22), fill=TEXT)
            bw, bh = (285, 380)
            left = image(BASE, (bw, bh))
            right = image(DIR / (item["id"] + ".webp"), (bw, bh))
            top = y + 57
            board.paste(left, (x + 17, top))
            board.paste(right, (x + 310, top))
            draw.text((x + 20, top + bh + 4), "OLD BASELINE", font=font(15), fill=MUTED)
            draw.text((x + 312, top + bh + 4), "STYLE IMAGE", font=font(15), fill=MUTED)
        draw.text((25, card_h * rows + title_h + 12),
                  "Not approved for V2 training. Every look needs a verified matching neutral master.",
                  font=font(17), fill=MUTED)
        board.save(out / f"catalog-review-{number:02d}.jpg", quality=91, subsampling=0)
    (out / "README.txt").write_text(
        "Seven pairs-of-images review sheets, six makeup styles per sheet.\n"
        "The left image is the current made-up 'no-makeup.webp' style, "
        "not a verified cosmetic-free photograph.\n"
        "Do not use these images as an authentic V2 before/after dataset.\n",
        encoding="utf8"
    )
    return ceil(len(styles) / per_sheet)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--out", type=Path, default=ROOT / "catalog-review-sheets")
    args = p.parse_args()
    print(f"Produced {generate(args.out)} review sheets from all 42 makeup styles.")
