# Boomtown documentation

The state of the world, in ten documents. Everything here describes the code as it is; where a
document records history instead, it says so and lives under `history/`.

## Current

| Document | Owns the question |
|---|---|
| [`architecture.md`](architecture.md) | What exists, where it lives, and how a command travels from a click to the engine and back |
| [`rules.md`](rules.md) | What the game *is* — the two published editions reconciled, the Boomtown variant specified, every `Ruleset` key |
| [`naming.md`](naming.md) | The corporations: the pool of 28, the merged-name rule, flavour accretion, card consolidation |
| [`online-play.md`](online-play.md) | The room, and the security model — addresses and tickets, knock/admit, seat tokens, every limit |
| [`development.md`](development.md) | How to run it, drive it and diagnose it, and every environment variable |
| [`testing.md`](testing.md) | What is actually verified, by which suite, and what tests cannot catch |
| [`deploying.md`](deploying.md) | Cutting a release, the PartyKit deploy, itch.io channels, versioning |
| [`steamos-game-mode.md`](steamos-game-mode.md) | Why the Linux build hangs on launch in SteamOS Game Mode, the shortlist of causes, and the procedure that settles it on the device |
| [`decisions.md`](decisions.md) | What was chosen and why, what was reversed, what is still open |
| [`screenshots/`](screenshots/) | Seventeen frames from one real game, in play order, and how to retake them |

Start with `architecture.md` for the system or `rules.md` for the game. `../CLAUDE.md` is the short
version of both, plus the constraints a change has to respect.

## Reference implementations that are not documents

Two files in `../design/` carry authority no prose can:

- `build.py` — generates the design canvas **and** is the reference implementation of the naming
  rules. The TypeScript is a port of it, pinned name-by-name by
  `packages/engine/test/naming.test.ts`. Port it; don't reimplement it. (Its company pool has
  drifted from the shipped one — see *Known divergence* in `naming.md`.)
- `skyline.psd` — the source art for the launch backdrop, recoloured by `make_skyline.py`.

Published design canvas, 9 artboards over 3 pages:
<https://claude.ai/code/artifact/f1b58905-2da0-4cd0-9c2e-8d65624260a3>

## Documentation that lives elsewhere in the tree

Two files belong to their own directory rather than here, and are the authority there:

- [`../apps/desktop/docs/illustration-brief.md`](../apps/desktop/docs/illustration-brief.md) — the
  illustration style brief: subject, treatment, what to avoid, the five surfaces it governs, and the
  one surface that is now a deliberate exception to it.
- [`../.claude/skills/run-app/SKILL.md`](../.claude/skills/run-app/SKILL.md) — how to serve the
  renderer and drive a real game with Playwright, and what its output means. The scripts beside it
  carry the traps in their headers.

## Plans

[`plans/`](plans/) holds the four plans the project was built from, with a status note per plan in
[`plans/README.md`](plans/README.md). Three are delivered and are read now for their *reasoning*
rather than as instructions. The web-deployment plan is the exception: only its security units have
shipped, and the rest is still the intended shape of a hosted build.

## History

[`history/`](history/) is archival. It holds the original design document, a review follow-up list
from the server phase, and the session handoffs — what each session diagnosed and landed. None of it
is maintained; where it disagrees with a current document, the current document is right.

## Keeping this true

A document that has drifted is worse than no document, because it is believed. So:

- A change that alters the rules model, the wire contract, the room's limits or the release process
  updates the document that owns it, in the same commit.
- Numbers that move — test counts, limits, versions — belong in one place each. `testing.md` owns
  test counts; `online-play.md` owns the room's limits; `deploying.md` owns the release process.
- When something is *not* done, say so in `decisions.md` under **Open** rather than leaving the
  current documents silent about it. The gap between what a reader assumes and what is true is the
  expensive kind of documentation bug.
