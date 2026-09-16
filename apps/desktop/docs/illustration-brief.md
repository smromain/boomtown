# Illustration style brief

Seeded in U1 (`design/build.py`'s `Language.dc.html`), refined here per U9. Governs the five
R13 surfaces, listed at the bottom. Approach only — producing a finished, commissioned art set
is separate downstream work (out of scope for this plan).

## Subject

The skyline the seven corporations are building — abstracted building silhouettes and cranes,
not literal logos, mascots, or people. The subject is the corporations themselves, seen from
outside the ledger instead of from inside it (see Relationship, below).

## Treatment

Flat, faceted shapes in one or two industry-adjacent tones over the warm paper ground
(`--bg: #faf6f0`). Figurative silhouette, not photographic and not cartoon-mascot. Depth comes
from overlapping flat shapes and a limited palette, never from gradients heavier than the
elevation scale in `Language.dc.html`, and never from a literal light source or cast shadow —
that would push the illustration toward realism the rest of the system deliberately avoids.

## Relationship to Saxon City

The whole visual direction is "the corporations are the subject, not the board, not the money"
(`docs/decisions.md`). A skyline is that same idea from outside: the seven start-ups as the
buildings themselves, which is also the header's own tagline ("seven start-ups, one skyline").

## Reference works

- Wingspan's box-cover skyline silhouette (flat, warm, layered).
- Ticket to Ride Europe's title-screen skyline (silhouette + one accent light).
- The WPA travel-poster flat-shape tradition (bold facets, no gradients, a small palette).

## Avoid

- Photographic skylines or any real, identifiable building silhouette.
- Cute mascot figures or faces.
- Gradients heavier than the elevation scale (`--elev-1/2/3` in `global.css`).
- Wood-grain, felt, canvas or scanned-paper texture of any kind (R3 — this governs illustration
  too, not just surface treatment).

## The five R13 surfaces

1. **Launch screen** (U9) — behind/around the menu, with the wordmark logo in front.
2. **Victory beat** (U11/U13) — composes with the victory beat's still-frame.
3. **Empty state — "no corporations founded yet"** (the corp band, U13/already seeded in U7 as a
   faded industry-mark row; a fuller illustration can replace the marks later without changing
   the copy).
4. **Empty state — "no moves yet"** (the Story feed).
5. **Empty state — "nothing in the tray"** (the tray strip, once every corporation is founded).

No sixth surface. Corporation identity keeps its existing Heroicon marks (`marks.tsx`) —
illustration does not replace them.

## Placeholder assets in this codebase

The illustration wired into four of the five surfaces is `apps/desktop/src/art/Skyline.tsx` — a
flat, hand-authored inline-SVG skyline to this brief, parameterised by which industry accents show
(so the victory variant can pick up the game's actual colours without a new asset). It is a
stand-in for commissioned art: near-zero bundle cost, and swapping in real artwork later means
replacing this one component, not five call sites.

**The launch screen is now an exception to the brief**, recorded here rather than left to
contradict it silently. `apps/desktop/src/art/NightSkyline.tsx` draws a **pixel-art town at night**
— supplied as `design/skyline.psd` and recoloured onto the palette by `design/make_skyline.py`,
with the ranks drifting sideways at two speeds while the moon and stars hold still. It keeps what
this brief is actually protecting (abstracted buildings rather than real ones, no mascots, no
photography, no gradients, a small palette drawn from `global.css`) and breaks the flat-facet
treatment on purpose: pixel art at deliberate scale reads as a choice, where the same art smoothed
would read as a mistake. If commissioned art ever lands, the question to settle is whether the
launch screen rejoins the other four or the four follow it.

Everything under `apps/desktop/src/assets/night/` is generated. Edit the PSD and re-run the
script — never the PNGs.
