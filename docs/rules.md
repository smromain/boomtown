# Boomtown — rules model

Three rule sets ship, and they are not three of a kind.

**Two are reconstructions** of published editions, reconciled from two sources, both read in full:

- **2015 Avalon Hill edition** — `C0096_en-us_acquire.pdf`, 8 pages, the rulebook Steve supplied.
- **Classic edition** — https://www.cs.cmu.edu/~lanthony/classes/SEng/Design/acquire.html

Where those two disagree the difference is **configuration, not a fork**. The engine reads a
ruleset object; each edition is a preset.

**The third is ours.** **Boomtown** is this project's own variant, not a reconstruction of anyone's
rulebook: classic numbers throughout, plus closed books and a second way to end the game (*Going
Public*, below). It is described here as a design rather than as a source, and nothing in it is
claimed to be how the published game is played.

## Constants (every rule set agrees)

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
5. **End check** — the player *may* announce the end if a condition holds. Never forced. Under
   the Boomtown rule set the turn also holds here when a *motion to liquidate* is available, and
   the player may raise one instead of ending their turn (see *Going Public*).

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

### Surfacing the table in the UI

The price/bonus table is player-facing, not just engine internals — it is the chart people reach
for every turn. It renders as a **stock reference modal** built from the ruleset config rather than
drawn, so it stays correct across editions. Two views: the full matrix (all tiers, with each
corporation's current row marked), and a single-corporation ladder opened from its card in the
band. A merged corporation prices on the **survivor's** tier.

## Going Public (Boomtown rule set only)

A second ending, and the reason that rule set fixes the books closed. Configured under `endVote`;
absent from both published editions, where the whole section simply does not apply.

**The window.** A motion may be raised only while

- at least `quorumSafeCorps` corporations are safe, **and**
- no ordinary end condition is met.

The second clause is what keeps the two endings from overlapping: once the game *can* simply be
announced, announcing is strictly better than asking, so the motion closes itself off. Note that
this makes the end-check step reachable on a turn where nothing is announceable — a real change to
the turn, and the reason `finishTurn` has to test motion availability rather than the end condition
alone.

**Raising.** At the end-check step of their own turn, the active seat may *move to liquidate*, at
most `motionsPerPlayer` times in the whole game. Raising **is** voting for it: a player cannot
propose an ending and then vote it down.

**The register.** One vote per share held in a **safe** corporation. Safe only, because those are
the corporations certain to still exist at settlement — a chain that can still be eaten is not a
company anyone is voting the future of. Unissued bank stock has no owner and is not counted. The
register is published the first time any motion is raised and **never un-publishes**; it can only
grow, since safe is permanent, two safe corporations can never merge, and safe holdings only ever
increase. Nobody can be disenfranchised after being enfranchised, and the electorate cannot be
attacked.

**Voting.** The mover first, then clockwise. It carries on `quota` of the base named by
`quotaBase`, with at least `minBackers` seats behind it, and the game ends immediately. It is
settled as soon as the outcome is arithmetically fixed, in either direction.

**The price of a yes.** A carried motion ends the game, so nothing that follows matters. A failed
one is where every cost in the design is actually paid: the register stays public, and **everyone
who backed it plays the rest of the game with open books** — cash and holdings visible to the whole
table. Voting against is free. The expected cost of a yes is therefore `P(fail) × your privacy`,
which taxes speculative and spiteful votes precisely and leaves sincere ones nearly free.

| Key | Boomtown | What it does |
|---|---|---|
| `quorumSafeCorps` | 2 | How many safe corporations open the window |
| `quota` | ⅔ | Share of the register needed to carry |
| `quotaBySeats` | ½ at 5 and 6 seats | Bigger tables need a lower bar — coordination gets harder and responsibility diffuses |
| `quotaBase` | `register` | Denominator: the whole register, not just votes cast |
| `minBackers` | 2 | A motion is never one player's decision |
| `motionsPerPlayer` | 1 | Scarcity is what makes the timing a decision |
| `minPlayers` | 3 | Two players have no table to convince |

The numbers came from simulation, not taste (#27): quorum 2 gives a motion in 53–72% of games
against 7–17% at quorum 3, and the ⅔ quota that carries 63% of the time at three seats carries only
6% at six, which is what `quotaBySeats` exists to correct.

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

Boomtown takes the Classic column wholesale and adds two keys of its own:

| Rule | Boomtown | Config key |
|---|---|---|
| Cash and holdings | always hidden — not a table setting | `forcedVisibility` |
| Vote to end | see *Going Public* above | `endVote` |

**Boomtown is the default preset.** It takes classic's numbers, so what follows about classic's
geometry decides the default too: classic's board is unambiguous where the 2015 rulebook lists 100
tiles and never states the grid. Of the two reconstructions, **default to classic** for the same
reason.

A consequence worth stating where the engine is specified: a game created without naming a ruleset
has the books closed and can end by vote. The published editions are opt-in by name.

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
  announcing. Where a vote to end exists, it is a choice twice over: raising a motion is optional,
  and so is backing one.
- **Final settlement.** Pay bonuses for every active corporation as if merging, then the bank buys
  back all stock at current price. Stock in a corporation not on the board is worth nothing.
- **Hidden information.** Hand tiles and the draw pile are always hidden. Cash and holdings are
  hidden or open **by agreement** — a table setting, not a rule — except where a rule set fixes it
  (`forcedVisibility`), and except for a seat that backed a failed motion, whose books stay open
  for the rest of the game.
- **A corporation has two names.** See `naming.md`. The base name is identity; the display name
  accretes.
