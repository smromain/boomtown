# The beat curtain takes the table's tone (#64)

**Status:** design for review. Nothing here is built.
**Scope:** reading **A** of the issue (a light curtain for the light app), built so that reading **B**
(a dark mode) later costs no beat work at all. B stays its own issue.

## The finding that changes the size of A

The issue treats `.curtain`'s gradient as the thing to tokenise: "one of only three literal colours in
that file". That is true of `beats.module.css`, but the five beat components carry roughly twenty
more, inline, all tuned for a near-black ground:

| Literal | Where | Role on the ink curtain |
|---|---|---|
| `#1c1917 → #14110f` | `.curtain` | the ground |
| `#d8cfc3` | Endgame, Motion, Victory | primary body line |
| `#b8ac9f`, `#c9bfb2` | Endgame, Founding, Motion, Merger, Victory | secondary body (flavour, explanation) |
| `#9c9086`, `#8a8076` | Merger, Victory | muted labels, the "+" and "→" glyphs |
| `#6f665d` | `.hint`, Victory | the "click to continue" hint |
| `#2b2621` | Victory | row separators |
| `#d98a4e` | `.kicker`, Founding, Victory | the ember accent (kicker, founder bonus, winner) |
| `#faf6f0` | Merger, Victory | the total line; fallback survivor colour |
| `rgba(0,0,0,.55–.7)` | Founding, Merger | drop shadows under the certificate and chips |
| `color-mix(…, #1c1917)` | Founding, Merger | the dark side of each chip's bevel |

So swapping the curtain's background alone would put `#d8cfc3` text on cream (about 1.4:1, unreadable)
and a black shadow under every certificate. **A is a re-ink of five components, not a one-line CSS
change.** That is still small, but it is why the first step has to be a pure refactor.

## Step 1: a beat token set, with no visual change

Add a `--beat-*` set to `global.css` and replace every literal above with one of them. In this step
each token is set to today's value, so a screenshot of every beat before and after is identical.
That makes the refactor reviewable on its own and proves nothing was missed.

| Token | Step 1 value (today) | Step 2 value (light) |
|---|---|---|
| `--beat-bg` / `--beat-bg-2` | `#1c1917` / `#14110f` | `var(--bg)` / `var(--surface-2)` |
| `--beat-ink` | `#faf6f0` | `var(--ink)` |
| `--beat-ink-1` (primary body) | `#d8cfc3` | `var(--ink)` |
| `--beat-ink-2` (secondary body) | `#b8ac9f` | `#5c5147` (7.2:1 on cream) |
| `--beat-muted` (labels, glyphs) | `#9c9086` | `var(--muted)` |
| `--beat-hint` | `#6f665d` | `var(--muted)` (3.9:1, up from 3.1 today) |
| `--beat-rule` | `var(--chrome-rule)`, `#2b2621` | `var(--rule)` |
| `--beat-accent` | `#d98a4e` | `var(--accent)` `#b3462f` (5.1:1; the ember is only 2.5:1 on cream) |
| `--beat-shade` (bevel dark side) | `#1c1917` | `#1c1917` (unchanged: it darkens the corp colour, not the ground) |
| `--beat-shadow` | `rgba(0,0,0,.7)` stack | the `--elev-3` warm stack |

`#c9bfb2` and `#8a8076` fold into `--beat-ink-2` and `--beat-muted`; they are within a few percent
of those and read as drift, not intent. Done-when's "no literal hex in `beats.module.css`" then holds
for the components too, which is the version of that criterion worth having.

The tokens are defined **in terms of the ground tokens**, not as a second palette. That is the whole
of B's beat work done in advance: when a dark theme redefines `--bg`, `--ink` and `--muted`, the
curtain follows without anyone touching `beats/`.

## Step 2: the light curtain

Flip the right-hand column above. The question the issue rightly raises is whether a cream-on-cream
beat still lands as a moment, since tonal inversion is how the curtain takes the screen today. Four
things carry it instead, all already in the design language:

1. **The drop still reads.** The curtain keeps its 480ms `curtainDrop`, and its leading (bottom)
   edge carries an `--elev-3` shadow while it travels. Once it settles at `inset: 0` that edge is
   off-screen, so the shadow exists only during the sweep. The motion is the entrance, not the
   luminance jump.
2. **A top rule.** The curtain gets `--frame-top-rule` (3px ink), the framing device the language
   already uses for panels with no coloured cap. It ties the takeover to the ink header it covers.
3. **The industry glow does more work.** `curtainGlow` is a 30% wash of the corporation's colour.
   On cream a tint reads more strongly than on ink, so it likely stays at 30%. That will be judged
   in the browser rather than guessed here. The glow becomes the beat's colour, which suits a game
   about the corporations.
4. **Grain.** The curtain gets `.grain`, the one texture the language allows, as the note in
   `global.css` already says it should.

The chips and certificate keep their colours and bevels; only their shadows move to the warm stack,
because a black shadow on cream reads as dirt.

**What does not change:** the header bar, launch screen and the buy-stock pill stay ink chrome.
The curtain stops *being* chrome and becomes the ground. `TurnHandoff` already sits on `--bg` and
is untouched, so hot-seat privacy is not in play.

## Also soften the cut, but as polish, not the fix

The issue suggests trying a gentler transition before any colour work. I would do both, with the
colour first. With an ink curtain, dimming the table first only stretches the same inversion over a
longer time. With a cream curtain there is little left to soften. The leading-edge shadow in point 1
is the one transition change I'd make, and `prefers-reduced-motion` already turns the drop off, so
nothing new moves for those players. Under reduced motion today the curtain *cuts* straight to near
black, which is the harshest version of the bug; the light curtain fixes that case outright.

## The design canvas and docs

Per `CLAUDE.md`, the canvas is the source of truth, so this ships with:

- `design/build.py`: the three peak-frame artboards (`:1730`, `:1792`, `:1809`) redrawn on the
  cream ground, and their notes changed from "ink curtain" to "cream curtain, ink top rule". Re-read
  the published canvas and diff its visible text first, per the usual rule, then regenerate and
  republish at the same URL.
- `beats.module.css`'s header comment (currently "the same ink curtain the header/launch screen use
  (KTD1)").
- `docs/decisions.md:60`: "Five drop an opaque curtain" stays true; add that the curtain is the
  ground, not chrome, and why (#64).

## Verification

- Step 1: `run-app` screenshots of all five curtain beats before and after, which should match.
- Step 2: `run-app` through a merger (including a three-way), a founding, a motion, the endgame and
  the victory beat over the after-game carousel, with and without `prefers-reduced-motion`.
- `npm run typecheck`, `npm run lint`, `npm test`. `beats.test.tsx` and `VictoryBeat.test.tsx`
  should need no changes, because nothing in them asserts a colour.

## What this leaves for B (dark mode)

Unchanged from the issue's list: the `:root` and board tokens, a dark elevation scale, `--grain`,
the industry `ink` pairs in `packages/engine/src/pool.ts`, a second skyline tone from
`make_skyline.py`, and the modal scrim. The beats come off that list. I'd file B as its own issue
once A is merged.

## Decisions for Steve

1. **Cream curtain for everyone, or a setting?** Recommended: for everyone. A curtain-tone setting
   is a small dark mode, and B should be the real one.
2. **Accent on cream:** the ember `#d98a4e` fails contrast on cream, so the kicker and winner line
   take `--accent` (the brick red). The other option is a darker ember of our own, a new colour
   the language doesn't have yet. Recommended: `--accent`.
