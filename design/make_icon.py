#!/usr/bin/env python3
"""Generate the desktop app icon from the existing Boomtown logo.

`apps/desktop/src/assets/boomtown-logo.png` is a wide wordmark — skyline over
the word BOOMTOWN. That is the right shape for a launch screen and the wrong
one for an app icon: squeezed into a square the letters are unreadable at the
16-32px sizes a taskbar and a window switcher actually draw. So the icon is
the skyline mark alone, cropped out of that same artwork, on the app's own ink
background. Nothing new is drawn here; the source stays the one logo.

Output: `apps/desktop/build/icon.png`, 1024x1024. `build/` is
electron-builder's `buildResources` directory, so it is picked up for all three
platforms automatically and converted to `.icns` / `.ico` at package time — one
file, no per-platform variants to keep in sync.

Run after changing the logo:

    python3 design/make_icon.py

Pure stdlib on purpose (zlib + struct): the repo has no image dependency and
an icon build is not a reason to add one.
"""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "apps/desktop/src/assets/boomtown-logo.png"
TARGET = ROOT / "apps/desktop/build/icon.png"

CANVAS = 1024
#: The app's own background ink (`--bg`, and `backgroundColor` in window.ts).
INK = (20, 17, 12)
#: First row of the wordmark in the source art; everything above it is skyline,
#: and the buildings stand on that line.
WORDMARK_TOP = 169
#: The slice of skyline the icon uses: the central tower and the blocks either
#: side of it. The whole skyline is nearly 4:1 — squeezed into a square it
#: becomes a thin stripe adrift in empty space, and every building too small to
#: read. This crop is close to square already, so the mark fills the icon.
#: The edges fall in gaps between buildings (columns 389-399 and 607-617 of
#: the source are empty), so nothing is sliced down the middle.
MARK_BOX = (394, 0, 607, WORDMARK_TOP)
#: Fraction of the canvas the mark spans, leaving the margin an icon needs.
MARK_SPAN = 0.72
#: Where the buildings' baseline sits, as a fraction of the canvas height —
#: slightly below centre, so the sparks have sky above them.
BASELINE = 0.80
#: Corner radius as a fraction of the canvas — roughly the macOS app-icon
#: shape, and harmless on Windows and Linux.
CORNER = 0.22


def read_png(path: Path) -> tuple[int, int, bytearray]:
    """Decode a non-interlaced 8-bit RGBA PNG to a flat RGBA buffer."""
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise SystemExit(f"{path} is not a PNG")

    width = height = 0
    idat = bytearray()
    pos = 8
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos : pos + 4])
        kind = data[pos + 4 : pos + 8]
        body = data[pos + 8 : pos + 8 + length]
        if kind == b"IHDR":
            width, height, depth, colour, _comp, _filt, interlace = struct.unpack(">IIBBBBB", body)
            if (depth, colour, interlace) != (8, 6, 0):
                raise SystemExit("expected an 8-bit RGBA, non-interlaced PNG")
        elif kind == b"IDAT":
            idat += body
        pos += 12 + length

    raw = zlib.decompress(bytes(idat))
    stride = width * 4
    pixels = bytearray(width * height * 4)
    previous = bytearray(stride)
    offset = 0
    for y in range(height):
        filter_type = raw[offset]
        offset += 1
        line = bytearray(raw[offset : offset + stride])
        offset += stride
        for x in range(stride):
            left = line[x - 4] if x >= 4 else 0
            up = previous[x]
            up_left = previous[x - 4] if x >= 4 else 0
            if filter_type == 1:
                line[x] = (line[x] + left) & 0xFF
            elif filter_type == 2:
                line[x] = (line[x] + up) & 0xFF
            elif filter_type == 3:
                line[x] = (line[x] + (left + up) // 2) & 0xFF
            elif filter_type == 4:
                estimate = left + up - up_left
                da, db, dc = abs(estimate - left), abs(estimate - up), abs(estimate - up_left)
                nearest = left if (da <= db and da <= dc) else (up if db <= dc else up_left)
                line[x] = (line[x] + nearest) & 0xFF
        pixels[y * stride : (y + 1) * stride] = line
        previous = line
    return width, height, pixels


def write_png(path: Path, size: int, pixels: bytearray) -> None:
    stride = size * 4
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter: none — the compressor copes, and this stays simple
        raw += pixels[y * stride : (y + 1) * stride]

    def chunk(kind: bytes, body: bytes) -> bytes:
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body))

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )


def opaque_bounds(width: int, pixels: bytearray, top: int, bottom: int) -> tuple[int, int, int, int]:
    """Bounding box of visible pixels in rows [top, bottom)."""
    min_x, max_x, min_y, max_y = width, -1, bottom, -1
    for y in range(top, bottom):
        row = y * width * 4
        for x in range(width):
            if pixels[row + x * 4 + 3] > 8:
                min_x, max_x = min(min_x, x), max(max_x, x)
                min_y, max_y = min(min_y, y), max(max_y, y)
    if max_x < 0:
        raise SystemExit("no visible pixels in the requested rows")
    return min_x, min_y, max_x + 1, max_y + 1


def opaque_bounds_in(width: int, pixels: bytearray, box: tuple[int, int, int, int]):
    """Bounding box of visible pixels inside `box`."""
    x0, y0, x1, y1 = box
    min_x, max_x, min_y, max_y = x1, -1, y1, -1
    for y in range(y0, y1):
        row = y * width * 4
        for x in range(x0, x1):
            if pixels[row + x * 4 + 3] > 8:
                min_x, max_x = min(min_x, x), max(max_x, x)
                min_y, max_y = min(min_y, y), max(max_y, y)
    if max_x < 0:
        raise SystemExit("no visible pixels in the crop")
    return min_x, min_y, max_x + 1, max_y + 1


def resample(
    src: bytearray, src_w: int, box: tuple[int, int, int, int], out_w: int, out_h: int
) -> bytearray:
    """Box-filter a cropped region down to out_w x out_h, averaging in premultiplied alpha."""
    x0, y0, x1, y1 = box
    span_x, span_y = (x1 - x0) / out_w, (y1 - y0) / out_h
    out = bytearray(out_w * out_h * 4)
    for oy in range(out_h):
        sy0, sy1 = int(y0 + oy * span_y), max(int(y0 + (oy + 1) * span_y), int(y0 + oy * span_y) + 1)
        for ox in range(out_w):
            sx0 = int(x0 + ox * span_x)
            sx1 = max(int(x0 + (ox + 1) * span_x), sx0 + 1)
            r = g = b = a = 0.0
            count = 0
            for sy in range(sy0, sy1):
                row = sy * src_w * 4
                for sx in range(sx0, sx1):
                    i = row + sx * 4
                    alpha = src[i + 3] / 255
                    r += src[i] * alpha
                    g += src[i + 1] * alpha
                    b += src[i + 2] * alpha
                    a += alpha
                    count += 1
            o = (oy * out_w + ox) * 4
            if a > 0:
                out[o] = min(255, round(r / a))
                out[o + 1] = min(255, round(g / a))
                out[o + 2] = min(255, round(b / a))
            out[o + 3] = round(255 * a / count)
    return out


def rounded_mask(size: int, radius: float, samples: int = 3) -> list[float]:
    """Coverage 0..1 per pixel for a rounded square, supersampled for smooth edges."""
    mask = [0.0] * (size * size)
    step = 1 / samples
    for y in range(size):
        for x in range(size):
            hits = 0
            for sy in range(samples):
                py = y + (sy + 0.5) * step
                for sx in range(samples):
                    px = x + (sx + 0.5) * step
                    dx = max(radius - px, px - (size - radius), 0.0)
                    dy = max(radius - py, py - (size - radius), 0.0)
                    if dx * dx + dy * dy <= radius * radius:
                        hits += 1
            mask[y * size + x] = hits / (samples * samples)
    return mask


def main() -> None:
    width, _height, pixels = read_png(SOURCE)
    # Trim the crop to what is actually painted inside it, so the mark is
    # centred on the buildings rather than on whatever padding the box has.
    x0, y0, x1, y1 = MARK_BOX
    box = opaque_bounds_in(width, pixels, MARK_BOX)
    mark_w, mark_h = box[2] - box[0], box[3] - box[1]

    span = int(CANVAS * MARK_SPAN)
    if mark_w >= mark_h:
        out_w, out_h = span, max(1, round(span * mark_h / mark_w))
    else:
        out_h, out_w = span, max(1, round(span * mark_w / mark_h))
    mark = resample(pixels, width, box, out_w, out_h)

    canvas = bytearray(CANVAS * CANVAS * 4)
    mask = rounded_mask(CANVAS, CANVAS * CORNER)
    for i in range(CANVAS * CANVAS):
        coverage = mask[i]
        canvas[i * 4] = INK[0]
        canvas[i * 4 + 1] = INK[1]
        canvas[i * 4 + 2] = INK[2]
        canvas[i * 4 + 3] = round(255 * coverage)

    left = (CANVAS - out_w) // 2
    top = min(CANVAS - out_h, max(0, round(CANVAS * BASELINE) - out_h))
    for y in range(out_h):
        for x in range(out_w):
            s = (y * out_w + x) * 4
            alpha = mark[s + 3] / 255
            if alpha == 0:
                continue
            d = ((top + y) * CANVAS + (left + x)) * 4
            for c in range(3):
                canvas[d + c] = round(mark[s + c] * alpha + canvas[d + c] * (1 - alpha))
            # keep the rounded silhouette: the mark never paints outside it
            canvas[d + 3] = max(canvas[d + 3], round(255 * alpha * mask[(top + y) * CANVAS + left + x]))

    write_png(TARGET, CANVAS, canvas)
    print(f"wrote {TARGET.relative_to(ROOT)} — {CANVAS}x{CANVAS}, mark {out_w}x{out_h} from {box}")


if __name__ == "__main__":
    main()
