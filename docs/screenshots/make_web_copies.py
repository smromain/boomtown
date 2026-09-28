#!/usr/bin/env python3
"""Regenerate the web copies the README embeds.

The originals are 1920 x 1080 PNGs and total ~4.5 MB, which is too much to put
at the top of a README. This scales them to 1600 wide and writes WebP at
quality 88 into web/ -- still sharp above the ~900px a README column gives
them.

Run after retaking any screenshot:

    python3 docs/screenshots/make_web_copies.py

Needs Pillow (pip install Pillow); nothing else in the project does, which is
why it is a script here rather than a build step.
"""

import sys
from pathlib import Path

from PIL import Image

QUALITY = 88
WIDTH = 1600
HERE = Path(__file__).parent
WEB = HERE / "web"


def main() -> int:
    originals = sorted(HERE.glob("*.png"))
    if not originals:
        print(f"no PNGs in {HERE}", file=sys.stderr)
        return 1

    WEB.mkdir(exist_ok=True)
    total_in = total_out = 0

    for src in originals:
        dst = WEB / (src.stem + ".webp")
        image = Image.open(src).convert("RGB")
        scale = min(1, WIDTH / image.width)
        small = image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)
        small.save(dst, quality=QUALITY, method=6)
        total_in += src.stat().st_size
        total_out += dst.stat().st_size
        print(f"{dst.name:36} {src.stat().st_size / 1024:7.0f} KB"
              f" -> {dst.stat().st_size / 1024:6.0f} KB  {small.size[0]}x{small.size[1]}")

    # Anything in web/ without an original is a leftover from a renamed shot.
    for stale in sorted(WEB.glob("*.webp")):
        if not (HERE / (stale.stem + ".png")).exists():
            print(f"stale (no original): {stale.name}", file=sys.stderr)

    print(f"{len(originals)} frames: {total_in / 1024 / 1024:.2f} MB"
          f" -> {total_out / 1024:.0f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
