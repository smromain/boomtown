# Boomtown — decisions and open questions

## Settled

| Decision | Choice | Why |
|---|---|---|
| Ruleset | **Configurable**, defaulting to classic | The two rulebooks disagree on safe size, end trigger, bonus tiers and price bands. One data-driven config covers both editions and house rules; see `rules.md`. |
| Play modes | Local hot-seat, online multiplayer, **and** AI opponents | Chosen together. Online multiplayer is what forces an authoritative server: the tile bag and hands are genuinely hidden information. AI needs the engine to expose a clean legal-move list and a state evaluator. |
| Visual direction | **Saxon City** direction, now "Boomtown" | Picked from three: Board Room (the board is the subject), Saxon City (the corporations are), Trading Floor (the money is). The other two are kept on the canvas's "Earlier directions" page for reference. |
| Title | **Boomtown** | Original; the original game's name is a live trademark. |
| Corporations | Parodies of **defunct** giants, drawn one per industry from a pool of 28 | Lower risk than live brands and a better joke — the theme rhymes with the mechanic. See `naming.md`. |
| Merged names | **Accrete**, never replace | A replacing rule threw away everything previously swallowed and converged on a stable stem. Accretion keeps the whole meal and gets sillier over a game. |
| Long names | Solved by **card consolidation**, not truncation | Steve's idea. Cards are one slot wide per corporation they contain, so the band's total width is constant and a corporation earns its own room. |
| Board geometry | 12 × 9 = 108, `1A`–`12I` | Classic is unambiguous; the 2015 rulebook says 100 tiles and never states the grid. |
| Stock reference | A modal, **generated from the ruleset**, showing live market positions | The paper game ships a printed card. The digital one renders the same table from `priceBands` and `bonusTiers`, so the 2015 preset produces different bands and a third bonus column from one component — and it can mark where every corporation actually stands, which cardboard cannot. |
| Dead-tile sweep | **Both editions** — reveal, set out of play, replace | The classic rulebook does not spell it out, but the rule (a tile that would merge two safe corporations is unplayable and gets replaced) is the same in both; a tile that can never be played must not stay stuck in a hand. `deadTilePolicy` still exists as a config knob. |
| Online substrate | **PartyKit**, one room object per game (KTD6) | Hand-rolled `ws` server, Colyseus and boardgame.io all rejected — see the architecture plan's alternatives. Deployed at `boomtown.smromain.partykit.dev`; `packages/server/`. |
| Desktop packaging | electron-builder, three-OS CI matrix, unsigned by default | electron-vite bundles everything from source so the app ships no `node_modules`. Fuses (KTD9) flipped in `afterPack`. Signing/notarization secrets are wired in `release.yml` but not set. See `deploying.md`. |
| Online host in the build | Baked from `apps/desktop/.env.production`, Settings can override per-user | A release build with neither is a packaging mistake and throws rather than silently falling back to `localhost`. |
| Auto-update | Wired in code, **no feed** — graceful no-op until a hosting target is picked | GitHub Releases / S3 / static host is an open call; `updater.ts` already degrades cleanly. |
| Board rendering | **2D CSS grid** (`apps/desktop/src/board/`) | Reverses KTD8's "deliberately basic 3D / React Three Fiber". The design canvas always drew a flat grid; a top-down R3F board added a fixed-zoom camera, a font pipeline (troika) and ~2.2 MB of bundle to reproduce it. The grid fills its container via `aspect-ratio`, so it scales with the space. R3F / three / troika removed. |

## Open

- **Trademark clearance.** Nothing in the pool has been searched. The mechanics are not
  protectable and you can implement them freely, but the names have not been cleared and should be
  before launch. Known to avoid: *Big Fish* (Big Fish Games publishes games), *Blockbusting* (real
  estate term with an ugly history). *Bigger Boat* was rejected as a Jaws quote.
- **The backwards Я in "Toys Я Were"** is Toys R Us trade dress rather than wordplay. It is the
  riskiest single element in the pool and the first thing to swap if anyone gets nervous.
- **The "riffing on" column** in `naming.md` and on the pool artboard is a design note so the list
  can be reviewed. It must not ship as a string anywhere in the product.
- **A vote-to-end ruleset, "Going Public", proposed but not built.** Classic as the baseline plus
  one addition: once two corporations are safe, a player may move to liquidate early, carried by a
  supermajority of a register where one share in a *safe* corporation is one vote. Raising a motion
  publishes that register, and if the motion **fails**, everyone who backed it opens their books
  permanently. Every price in the design is a failure price — a carried motion ends the game, so
  none of the disclosure matters. The name is the mechanic: an offering, and opening the books.
  The dials move with the seat count — no vote at all at two seats (a call, where *refusing*
  discloses), ⅔ at three and four, 60% of votes cast plus a seconder at five and six. The full note — the game theory, a worked tally, the config keys
  and the engine surface — is the design canvas's sibling artifact:
  https://claude.ai/code/artifact/16f2c904-19b8-4c7b-a477-5a9cf95db85e
  Two things it turns up that outlive the proposal:
  - **It makes visibility a rule, contradicting a stated principle.** `CLAUDE.md` says cash and
    holdings visibility is a per-table setting. Going Public has to force `hidden` and refuse to let
    the table change it: at an open table the register is already public and the disclosure costs
    nothing, so the mechanic evaporates. If it ships, that exception needs to be stated where the
    principle is.
  - **A plain majority vote is not worth building.** Ending the game freezes variance, and variance
    is the only route to first for anyone not already there, so every trailing player votes to
    continue. The yes-coalition is normally one player against the rest, and the vote becomes a
    ritual. Weighting by shareholding is what makes it a real decision; a supermajority is what
    stops the leader self-serving.

- **Bots are handed the authoritative state, not a filtered view.** `attachBotDriver` calls
  `chooseMove(options.snapshot(), seat, rng)`, and `snapshot()` returns the full `GameState`.
  `clientView()` does the per-seat filtering that hidden information depends on, and the bot path
  goes around it. What they *reach* and what they *use* differ, and the difference decides how big
  the fix is:
  - **Opponents' holdings are genuinely read.** `bonusExposure` in `queries/evaluate.ts` maps over
    `state.seats` to rank every holder of a corporation. Its own docstring claims the function
    "reads only public state and `seat`'s own holdings" — the comment asserts the invariant the
    code breaks. Legitimate at an open table, a leak at a hidden one.
  - **Hands and the bag are not read into any score**, and that is structural rather than lucky:
    `ownMoves` filters `legalMoves` to the bot's own commands, and `scoreMove` stops recursing once
    `decider !== seat`, so lookahead never expands an opponent's options. Nothing *enforces* it,
    though — deepen the lookahead to model an opponent reply and the hands are right there in the
    parameter. Worth making unreachable rather than merely unused.

  The fix is "a bot sees what a player at that table could see", which is what `clientView` already
  computes — not a bespoke rule about bots. It costs little strength, for the reason below.

- **"Hidden" holdings are derivable from the public log.** `shares-bought` carries the exact
  `picks`, and `eventText` renders it to the whole table ("Ana bought 3 Concordia, 1 Enrun for
  $4,200"); the server filters each connection's *view*, not the event log. So the hidden setting
  conceals the running tally, not the transactions — card counting, where the information is public
  and the bookkeeping is the work. Two consequences: restricting bots to a filtered view barely
  weakens them, since they can accumulate the log like anyone else; and **Going Public needs a second
  clause suppressing purchase detail in the public log**, or the register it publishes is one the
  table could already reconstruct and the mover's disclosure sells nothing.

- **`mergeNaming.stem` value.** 0.75 as specified; 0.6 drifts further. Playtest rather than decide.
- **2015 board dimensions**, if that preset is ever wanted for real. The rulebook does not say.
- **The 2015 corporation names** live on the info-card artwork, which is an image in the PDF. Only
  *Etch* and *Bolt* appear in the worked examples. Not needed unless the 2015 preset ships with its
  own names.

## Things that bit during design — worth not rediscovering

- **The 2015 secondary bonus column is not a formula.** Primary is 10× share price and tertiary is
  5×, but secondary (1500, 2200, 3000, 3700, 4200, 5000, 5700, 6200, 7000, 7700, 8200) fits no
  multiplier. It must ship as a lookup table. Verified against the rulebook's own worked example.
- **A naive syllable splitter returns whole words.** `Transworldly` and `Sizzle's` both yielded
  themselves as fragments, which swamps the stem. Fixed with a VCCV split rule, a 3–6 letter clamp,
  and skipping one-character words. All 28 pool names were re-checked, not just the seven in play.
- **The board badge stays stable for free**, because the stem is always taken from the front. Worth
  keeping as a deliberate constraint rather than an accident.
