# Boomtown — rules model

Reconciled from two sources, both read in full:

- **2015 Avalon Hill edition** — `C0096_en-us_acquire.pdf`, 8 pages, the rulebook Steve supplied.
- **Classic edition** — https://www.cs.cmu.edu/~lanthony/classes/SEng/Design/acquire.html

Where they disagree the difference is **configuration, not a fork**. The engine reads a ruleset
object; both editions are presets.

## Constants (both editions agree)

| | |
|---|---|
| Players | 2–6 |
| Starting cash | $6,000 |
| Tiles in hand | 6 |
| Corporations | 7 |
| Shares per corporation | 25 (175 total) |
| Stock purchases per turn | up to 3, across any active corporations |
| Founder's bonus | 1 free share, if the bank still has one |
| Price tiers | 3 (tier 2 = tier 1 + $100, tier 3 = tier 1 + $200) |

## Turn

1. **Place a tile** — mandatory if any tile in hand is playable. Exactly one outcome fires:
   - **Nothing** — no orthogonally adjacent tile.
   - **Found** — adjacent to one or more unincorporated tiles and no corporation. Founder picks any
     free headquarters, places it on any tile of the new group, takes 1 free share *if available*.
     Blocked while all 7 headquarters are in play; the tile stays in hand and is **not** dead.
   - **Grow** — adjacent to exactly one corporation. It absorbs the tile and any unincorporated
     tiles the tile touches.
   - **Merge** — adjacent to two or more corporations. Illegal if it would dissolve a safe
     corporation; two safe corporations can never merge.
2. **Buy stock** — optional, up to 3 shares total, active corporations only. Capped by cash and by
   bank stock.
3. **Draw** back to six tiles.
4. **Dead-tile sweep** — a permanently unplayable tile (one that would illegally merge two safe
   corporations) is revealed, set face-up out of play, and replaced from the bag. A replacement
   that is itself dead is swept in the same pass. New dead tiles that appear mid-turn wait until
   the next sweep.
5. **End check** — the player *may* announce the end if a condition holds. Never forced.

## Merger resolution

Order matters; this is the only part of the game with real sequencing.

1. Count sizes **before** the merging tile. The placed tile never counts toward either corporation
   for size, price or bonus. It joins the survivor afterwards.
2. Largest survives. On a size tie the **mergemaker** chooses. With three or more corporations,
   every smaller one goes defunct at once.
3. Resolve defunct corporations **one at a time, largest first**. The mergemaker breaks ordering
   ties. Each is fully resolved before the next begins.
4. **Pay stockholder bonuses**, priced by the defunct corporation's size before the merger.
   Nothing is paid on the survivor.
5. **Dispose of defunct stock — mergemaker first, then clockwise.** Each holder may split their
   shares across *hold*, *sell* (at the defunct price) and *trade* (2 defunct → 1 survivor).
   Trading is capped by the survivor's remaining bank stock.
6. **Return the headquarters** to the tray. It can found a corporation of that name again later,
   and held shares of that name become live again if it does.

## Bonus ties

| Case | 2015 | Classic |
|---|---|---|
| Tie for primary | combine primary + secondary, halve, round up to nearest 100. Next holder down becomes secondary and takes the tertiary bonus | combine primary + minority, halve |
| Tie for secondary | combine secondary + tertiary, halve, round up. Third-most holder gets nothing | split the minority bonus |
| Tie for tertiary | split the tertiary bonus, round up | n/a — only two bonuses |
| Sole shareholder | takes primary **and tertiary** — not secondary | takes both bonuses |

## Price and bonus table

Sizes are given per tier for each edition; the money columns are shared.
**Primary is always 10× the share price and tertiary (classic: minority) is always 5×.**
**The 2015 secondary column is not a multiple of anything — it is a printed lookup and must ship
as data.** Verified against the rulebook's own worked example: a five-tile tier-3 corporation pays
7,000 / 5,000 / 3,500.

| Cl·T1 | Cl·T2 | Cl·T3 | 15·T1 | 15·T2 | 15·T3 | Share | Primary | Secondary (2015) | Tertiary |
|---|---|---|---|---|---|---|---|---|---|
| 2 | — | — | 2 | — | — | $200 | $2,000 | $1,500 | $1,000 |
| 3 | 2 | — | 3 | 2 | — | $300 | $3,000 | $2,200 | $1,500 |
| 4 | 3 | 2 | 4 | 3 | 2 | $400 | $4,000 | $3,000 | $2,000 |
| 5 | 4 | 3 | 5 | 4 | 3 | $500 | $5,000 | $3,700 | $2,500 |
| 6–10 | 5 | 4 | 6–7 | 5 | 4 | $600 | $6,000 | $4,200 | $3,000 |
| 11–20 | 6–10 | 5 | 8–17 | 6–7 | 5 | $700 | $7,000 | $5,000 | $3,500 |
| 21–30 | 11–20 | 6–10 | 18–27 | 8–17 | 6–7 | $800 | $8,000 | $5,700 | $4,000 |
| 31–40 | 21–30 | 11–20 | 28–37 | 18–27 | 8–17 | $900 | $9,000 | $6,200 | $4,500 |
| 41+ | 31–40 | 21–30 | 38+ | 28–37 | 18–27 | $1,000 | $10,000 | $7,000 | $5,000 |
| — | 41+ | 31–40 | — | 38+ | 28–37 | $1,100 | $11,000 | $7,700 | $5,500 |
| — | — | 41+ | — | — | 38+ | $1,200 | $12,000 | $8,200 | $6,000 |

## Edition configuration

| Rule | 2015 Avalon Hill | Classic | Config key |
|---|---|---|---|
| Board | 100 tiles, dimensions never stated | 12 × 9 = 108, `1A`–`12I` | `boardCols` / `boardRows` |
| Safe size | 10+ | 11+ | `safeSize` |
| End trigger | one corporation at 38+ | one chain at 41+ | `endChainSize` |
| Bonus tiers | primary · secondary · tertiary | majority · minority | `bonusTiers` |
| Price bands | 2,3,4,5,6–7,8–17,18–27,28–37,38+ | 2,3,4,5,6–10,11–20,21–30,31–40,41+ | `priceBands` |
| Sole shareholder | primary + tertiary | both bonuses | `soleHolderPolicy` |
| Dead tiles | discarded face-up and replaced | discarded face-up and replaced (from the same rule, applied to both) | `deadTilePolicy` |
| Two-player rule | bank is a shareholder; its holding drawn from the tile pile each merger | not addressed | `phantomShareholder` |
| Split rounding | round up to nearest 100 | silent | `splitRounding` |

**Default to classic.** Its board geometry is unambiguous; the 2015 rulebook lists 100 tiles and
never states the grid.

## Invariants

- **Stock is finite.** An empty bank blocks buying, the founder's bonus and 2:1 trades alike — the
  founder simply gets nothing.
- **Active stock never sells.** Shares become cash only via merger disposal or final settlement.
  No loans, no player-to-player trading.
- **Broke is playable.** A player with no cash still places and draws. No elimination.
- **Safe is permanent.** A safe corporation can still absorb others and keep growing.
- **Two kinds of unplayable.** *Permanently dead* — would merge two safe corporations; revealed,
  set out of play, and replaced. *Temporarily blocked* — would found an eighth corporation; stays
  in hand.
- **Ending is a choice.** A player may announce or keep playing, and finishes the turn after
  announcing.
- **Final settlement.** Pay bonuses for every active corporation as if merging, then the bank buys
  back all stock at current price. Stock in a corporation not on the board is worth nothing.
- **Hidden information.** Hand tiles and the draw pile are always hidden. Cash and holdings are
  hidden or open **by agreement** — a table setting, not a rule.
- **A corporation has two names.** See `naming.md`. The base name is identity; the display name
  accretes.
