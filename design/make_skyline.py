#!/usr/bin/env python3
"""Recolour `design/skyline.psd` into the launch screen's night backdrop.

The PSD is a pixel-art night skyline in blues: a deep blue sky, a white moon,
white stars, two ranks of buildings and a scatter of lit windows. Boomtown's
palette is warm — cream on ink, one rust accent, no blue anywhere — so the art
is not used as drawn. Every layer is mapped, colour by colour, onto the
palette in `apps/desktop/src/styles/global.css`, and written out as separate
PNGs so the renderer can move the ranks independently.

The split matters. Buildings drift; the moon and stars do not. A moon that
slides off the edge of the screen reads as a camera pan rather than a town at
night, and two ranks drifting at different speeds is what gives the flat art
its depth. So this writes four files rather than one composite:

    night-far.png     the back rank, with its window speckle
    night-near.png    the front rank, with its lit windows
    night-stars.png   stars alone, to sit still
    night-moon.png    the moon and its two glow rings, likewise

The sky is not written at all: it is one flat colour, and a PNG of a flat
colour is a worse way to say `background: var(--chrome-bg)`.

The mapping is exact rather than a hue rotation. Each layer is two or three
flat colours (pixel art, no anti-aliasing), so every source colour is named
here and anything unrecognised is reported rather than guessed at — a silent
fallback is how one stray blue survives into a warm scene.

Needs `psd-tools` and `pillow`, neither of which the app depends on; this is a
design-time step whose *output* is committed. Run after editing the PSD:

    pip install psd-tools pillow
    python3 design/make_skyline.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image
from psd_tools import PSDImage

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "design/skyline.psd"
TARGET = ROOT / "apps/desktop/src/assets/night"

Colour = tuple[int, int, int]

#: The palette, straight out of `global.css`. Named here so a change there can
#: be followed through to the art rather than eyeballed against it.
INK = (0x1C, 0x19, 0x17)  # --chrome-bg, the sky this art sits on
CREAM = (0xFA, 0xF6, 0xF0)  # --chrome-ink
RULE = (0x46, 0x40, 0x3A)  # --chrome-rule
STONE = (0xC9, 0xBC, 0xAC)  # the ink-tone Skyline silhouette, for moon craters

#: Every flat colour in the PSD, mapped to what it becomes.
#:
#: The two ranks keep their *relation* — the far one lighter and hazier, the
#: near one nearly black — because that is what reads as distance. What changes
#: is the family: blues become the browns the rest of the app is built from.
RECOLOUR: dict[str, dict[Colour, Colour]] = {
    "back buildings": {
        (0x2F, 0x45, 0x82): (0x3A, 0x33, 0x2C),  # far silhouette
        (0x8D, 0xB2, 0xDE): (0x5C, 0x52, 0x49),  # the haze bank below it
    },
    "building shadows": {
        (0x4E, 0x61, 0x95): (0x4A, 0x42, 0x39),  # window speckle on the far rank
    },
    "front buildings": {
        # The near rank has to sit *below* the sky in value by about as much as
        # it did in the PSD (roughly 13 of 255), or its skyline edge disappears
        # against the ink. Blue gave the original that separation for free, in
        # hue; warm greys have to buy it in value.
        (0x17, 0x03, 0x67): (0x0D, 0x0B, 0x09),  # near silhouette
        (0x35, 0x52, 0x7C): (0x1F, 0x1B, 0x17),  # its lower mass
    },
    "lights": {
        # The one warm light in the scene stays warm: a lamp behind a window,
        # cream pulled towards the rust accent rather than the accent itself,
        # which at this size reads as a fire rather than an office.
        (0xF1, 0xEB, 0x9C): (0xE3, 0xC2, 0x8C),
    },
}

#: Greyscale layers are ramped instead of mapped: the moon is 85 shades of grey
#: and naming each one would be a table nobody could check. Black becomes the
#: crater stone, white becomes the cream.
RAMPED = {
    "moon": (STONE, CREAM),
    "shadow moon 1": (STONE, CREAM),
    "shadow moon 2": (STONE, CREAM),
    # A dim star is a star, not a hole: the dark end lands on the chrome rule
    # rather than on the sky, so the faint ones stay just visible.
    "stars": (RULE, CREAM),
}

#: What ends up in which file, in painting order.
FILES = {
    "night-far.png": ["back buildings", "building shadows"],
    "night-near.png": ["front buildings", "lights"],
    "night-stars.png": ["stars"],
    "night-moon.png": ["shadow moon 2", "shadow moon 1", "moon"],
}


def blend(dark: Colour, light: Colour, t: float) -> Colour:
    return tuple(round(d + (l - d) * t) for d, l in zip(dark, light))  # type: ignore[return-value]


def recolour(image: Image.Image, name: str, unknown: set[Colour]) -> Image.Image:
    """Map one layer's colours onto the palette, keeping every alpha as it is."""
    source = image.convert("RGBA")
    raw = bytearray(source.tobytes())
    ramp = RAMPED.get(name)
    table = RECOLOUR.get(name, {})
    cache: dict[Colour, Colour] = {}
    for i in range(0, len(raw), 4):
        if raw[i + 3] == 0:
            continue
        pixel = (raw[i], raw[i + 1], raw[i + 2])
        replacement = cache.get(pixel)
        if replacement is None:
            if ramp:
                # Rec. 601 luma: the PSD's greys are neutral, but the glow
                # rings carry a tint at their edges and this keeps them on the
                # ramp rather than off the side of it.
                luma = (0.299 * pixel[0] + 0.587 * pixel[1] + 0.114 * pixel[2]) / 255
                replacement = blend(ramp[0], ramp[1], luma)
            elif pixel in table:
                replacement = table[pixel]
            else:
                unknown.add(pixel)
                replacement = pixel
            cache[pixel] = replacement
        raw[i], raw[i + 1], raw[i + 2] = replacement
    return Image.frombytes("RGBA", source.size, bytes(raw))


def main() -> None:
    psd = PSDImage.open(SOURCE)
    canvas = (psd.width, psd.height)
    layers = {layer.name: layer for group in psd for layer in group}

    unknown: set[Colour] = set()
    TARGET.mkdir(parents=True, exist_ok=True)
    for filename, names in FILES.items():
        sheet = Image.new("RGBA", canvas, (0, 0, 0, 0))
        for name in names:
            layer = layers[name]
            art = recolour(layer.composite(), name, unknown)
            # A layer's own opacity is part of the drawing — the moon's two
            # glow rings are 25% and 7% — and compositing it by hand means
            # applying it by hand.
            if layer.opacity < 255:
                alpha = art.getchannel("A").point(lambda v: round(v * layer.opacity / 255))
                art.putalpha(alpha)
            # Layers overhang the canvas on every side — the stars start 179px
            # above it. PIL clips the right and bottom itself, but a negative
            # offset has to be cropped off the art first, or the overhang is
            # pasted *into* the canvas and the whole layer sits low.
            left, top = layer.offset
            art = art.crop((max(-left, 0), max(-top, 0), art.width, art.height))
            sheet.alpha_composite(art, (max(left, 0), max(top, 0)))
        sheet.save(TARGET / filename, optimize=True)
        print(f"{filename}: {canvas[0]}x{canvas[1]} from {', '.join(names)}")

    if unknown:
        raise SystemExit(
            "unmapped colours (add them to RECOLOUR): "
            + ", ".join(f"#{r:02x}{g:02x}{b:02x}" for r, g, b in sorted(unknown))
        )


if __name__ == "__main__":
    main()
