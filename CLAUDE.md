# Boomtown

A web implementation of the board game **Acquire** — mechanics only, renamed and re-themed.
Design is complete and agreed. **No application code exists yet**; the next step is architecture.

## Read these first

| File | What it holds |
|---|---|
| `docs/rules.md` | The complete rules model: the two published editions reconciled, and the Boomtown variant specified. Turn structure, merger sequencing, bonus ties, the full price/bonus table, edition config keys, invariants. |
| `docs/naming.md` | The 28-company pool, the merged-name rule, flavour accretion, card consolidation, config. |
| `docs/decisions.md` | What was decided and why, what is still open, and the traps already hit. |
| `design/build.py` | Generates the design canvas **and** is the reference implementation of the naming rules. |

Published design canvas (9 artboards over 3 pages):
https://claude.ai/code/artifact/f1b58905-2da0-4cd0-9c2e-8d65624260a3

## Legal position, stated once

The rules and mechanics of a board game are not protectable and can be implemented freely.
**ACQUIRE** is a live Hasbro/Avalon Hill trademark, as are the original corporation names — none of
which are used. Everything in this project is original or a parody of a defunct brand.
**Nothing has been trademark-searched.** See the open questions in `docs/decisions.md`.

## Constraints that shape the architecture

- **The ruleset is data, not code.** Two published editions disagree on safe size, end trigger,
  bonus tiers and price bands. One engine, edition as a config object. A third preset,
  **Boomtown**, is the project's own variant rather than a reconstruction — classic numbers plus
  closed books and a vote that can end the game early — and is a preset, not a fork. **It is the
  default**, so a bare `createGame` deals a closed-books table whose turn can hold at end-check for
  a motion; a caller that wants the plain published game must ask for `classic` by name.
- **The engine must expose legal moves and evaluate state**, because AI opponents were chosen
  alongside hot-seat and online play.
- **Hidden information is real.** Hand tiles and the draw pile are always hidden; online play needs
  an authoritative server handing each client a filtered view. Cash and holdings visibility is a
  per-table setting, not a rule — for the two published editions. The Boomtown preset fixes it
  closed (`forcedVisibility`), because at an open table its register is already public and the
  disclosure it charges for costs nothing.
- **A corporation has two names.** `baseName` belongs to the headquarters marker and never changes
  — held defunct stock, refounding and the board badge all key off it. `displayName` is *derived*
  from the base name plus an ordered list of what it has eaten, never stored.
- **Merger resolution is the only genuinely sequenced part of the game.** Defunct chains largest
  first; per chain, bonuses then disposal in mergemaker-clockwise order; each fully resolved before
  the next. Get this wrong and nothing else matters.
- **The placed tile never counts** toward either corporation when sizes, prices or bonuses are
  computed. It joins the survivor afterwards.

## Working on the design canvas

`design/build.py` is the source of truth for every artboard. Never hand-edit the `.dc.html` files —
they are generated. To change the design, edit `build.py`, then:

```bash
cd design && python3 build.py
```

Then re-seed and republish via the `design` skill, keeping `design/boomtown.html` as the file path
so the artifact URL is preserved.

**The canvas is editable in the browser and Steve edits it.** Before regenerating, re-read the
published artifact and diff it against the working files — six flavour lines and two company names
were edited in the browser on 2026-09-06 and had to be folded back into `build.py`. Diff *visible
text*, not markup: the editor rewrites `<path/>` as `<path></path>` and escapes `&`, so a raw diff
is mostly noise.
