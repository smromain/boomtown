# Decisions — what was chosen, what changed, what is open

Three sections, and the distinction matters: **Accepted** is what the code does now and the reason
it does it; **Superseded** is a decision that was reversed, kept because the reversal is itself
information; **Open** is a live question nobody has answered yet. A decision that shipped is not
listed as open, however much reasoning it took to get there.

The commit history is the record of *how* each of these was reached. This file records where they
landed.

## Accepted

### The game

| Decision | Choice | Why |
|---|---|---|
| Ruleset | **Data, not code**, defaulting to Boomtown | The two published rulebooks disagree on safe size, end trigger, bonus tiers, price bands, sole-shareholder policy, dead tiles, the two-player rule and split rounding. One `Ruleset` object covers both editions, our own variant, and house rules. See `rules.md` |
| The Boomtown variant | **Shipped as a third preset, and the default** | Classic's numbers plus closed books and a vote that can end the game early. A preset rather than a change to either published edition: nobody has to accept a changed ending to a ruleset they know, and forced-hidden visibility is what the preset *is* rather than an exception carved out of a shipped edition. Built across [#23](https://github.com/smromain/boomtown/issues/23) |
| The vote's dials | **Measured, not argued** | ~200 seeded bot games per configuration ([#27](https://github.com/smromain/boomtown/issues/27)). Quorum 2 (not 3), ⅔ at three and four seats but ½ at five and six, at least two distinct backers, one motion per player, no notice period. Detail in `rules.md` |
| Title | **Boomtown** | Original. The original game's name is a live trademark |
| Corporations | Parodies of **defunct** giants, one per industry from a pool of 28 | Lower risk than live brands and a better joke — the theme rhymes with the mechanic. See `naming.md` |
| Merged names | **Accrete**, never replace | A replacing rule threw away everything previously swallowed and converged on a stable stem. Accretion keeps the whole meal and gets sillier over a game |
| Long names | Solved by **card consolidation**, not truncation | Steve's idea. A card is one slot wide per corporation it contains, so the band's total width is constant and a corporation earns its own room |
| Board geometry | 12 × 9 = 108, `1A`–`12I` | Classic is unambiguous; the 2015 rulebook says 100 tiles and never states the grid |
| Dead-tile sweep | **Both editions** — reveal, set out of play, replace | The classic rulebook does not spell it out, but the rule is the same in both, and a tile that can never be played must not stay stuck in a hand. `deadTilePolicy` remains a knob |
| Stock reference | A modal **generated from the ruleset** | The paper game ships a printed card. Generating it from `bandCuts` and `bonusTiers` means the 2015 preset produces different bands and a third bonus column from one component — and it can mark where every corporation actually stands, which cardboard cannot |

### The system

| Decision | Choice | Why |
|---|---|---|
| Engine | A **custom headless engine**, not a framework | `boardgame.io` was closest — turn-based, hidden state via `playerView`, generated bots — but its phase/stage model does not cleanly express nested, interruptible merger resolution, and it couples game state to its own server and storage |
| Engine contract | **Command → events + state, or a typed rejection** | `reduce` never throws for a rule violation. The ordered command log is both the persistence substrate and the replay/resync mechanism |
| Randomness | One seeded mulberry32 PRNG in state | `Math.random` and `Date.now` are lint errors in the engine. One unseeded call breaks replay, reconnection and bot reproducibility at once |
| Merger | An explicit **state machine** yielding typed pending decisions | The only genuinely sequenced part of the game. Hot-seat UI, bots and the room all satisfy decisions through the same command interface, and progress lives in the serialisable snapshot so it survives the reducer's clone |
| Hidden state | `viewFor(seat)`, plus `clientView` on top | The room serialises only a seat's own view. `clientView` adds `legalMoves` and per-tile effects the renderer cannot compute without full state |
| Play modes | Hot-seat, bots **and** online, chosen together | Online is what forces an authoritative server, because the bag and the hands are genuinely hidden. Bots are what force the engine to expose legal moves and an evaluator |
| Transports | One `GameTransport` seam, three implementations | Local, Web Worker, socket. Everything above it — store, dispatch, reconciliation — is identical, which is why the panels have no idea whether a game is local or online |
| Bots | A heuristic `Policy` over the engine, **no LLM** | One 1–10 dial drives lookahead plies and a blunder rate: a weak bot is a strong bot that fumbles, which keeps low difficulty from feeling broken rather than stupid |
| Bot information | A **redacted `GameState`**, not a narrower argument | A policy must run `reduce` to look ahead, so the honest boundary is `beliefState`: own hand intact, every other secret replaced by a plausible deal. Rule: *a bot sees what a player at that table could see*. Not yet true of the room's own bots — see **Open** |
| Bot beliefs | A **light ledger**, not a belief engine | Steve's call. The public log names the corporation bought, not the quantity, so the honest observable is a purchase *event* per seat per corporation. A pure fold over the log, rebuilt each turn, anchored to the publicly known issued total, so it stays replay-safe |
| Online substrate | **PartyKit**, one room object per game | A hand-rolled `ws` server, Colyseus and boardgame.io were all rejected; see the architecture plan's alternatives. Deployed at `boomtown.smromain.partykit.dev` |
| Room durability | Append to the log **before** events are observable | What makes the room disposable: it hibernates and rebuilds by replay. A log that cannot replay parks the room read-only, because a throw on wake would brick that room forever |
| Online identity | A rotating **per-seat token**, no accounts | 256 bits, compared in constant time, re-minted on every resume, so a captured token is worth one reconnect. A seat stays reserved while its player is away — a drop is a pause, not a forfeit |
| Getting a seat | **A knock, not a seat** | Possession of an address or a live code gets you into the host's queue and no further. A leaked link costs a declined knock rather than a hijacked seat, and it is the one control that needs no identity at all |
| Room addressing | **160-bit address, separate expiring ticket** | Collapsing the two made the address space as large as a code a person can read out. Split, the unguessable thing is 160 bits and the spoken thing only has to survive fifteen minutes. See `online-play.md` |
| Room visibility | No listing, no lobby browser, uniform misses | An unissued, expired and retired ticket answer identically, so sweeping the space learns nothing |
| Desktop packaging | electron-builder, three-OS CI matrix, unsigned by default | electron-vite bundles from source so the app ships no `node_modules`. Fuses flipped in `afterPack`. Signing secrets are wired in `release.yml` but not set |
| Online host in the build | Baked from `.env.production`, overridable in Settings | A release build with neither is a packaging mistake and throws rather than silently falling back to `localhost` |
| Versioning | **CalVer `YYYY.M.N`**, and a separate protocol integer | Semver promises compatibility to API consumers; this project has players on a storefront, for whom the only useful question is how fresh their build is. `PROTOCOL_VERSION` moves only when the wire breaks. See `deploying.md` |
| itch.io packaging | Push the **unpacked directory** per platform, not the installers | butler manages symlinks and permissions on a directory push, and the itch app extracts it itself — which is also why Gatekeeper never sees a quarantine flag on that path |
| The public log's detail | Under Boomtown, the log **names the corporation and never the amount** ([#60](https://github.com/smromain/boomtown/issues/60)) | Closed books that the event log then reads out are not closed: `cost` ÷ the public share price is the quantity, so a reader could keep an exact register of every seat — the information the setting withholds and the information a motion's `register-published` charges for. Suppressing the purchase outright would blind the mover, who has to judge whether two-thirds is reachable *before* paying for the register, so the corporation is still named. `publicPurchaseDetail` is the ruleset key; both published editions keep it on and log exactly what they always logged |
| Where that redaction happens | At the **transport**, per reader, not in the renderer | The room built one filtered view per seat and handed everyone the same event array, so a UI that merely declined to print the numbers would leave them on the wire, one devtools panel away. `redactEventsFor` is one helper called by both `game-room.ts` and `localTransport`, and it follows `viewFor`'s books rule rather than inventing a second one: your own purchases in full, everyone's at an open table, and a seat's permanently once a failed motion opened its books |
| The log a **hot-seat** table sees | Redacted to the **public view** when the client holds more than one seat | There is one store and one log per client, not one per seat, so there is no "you" to redact for when several people share a screen — and the stricter reading is the one the hand-off card exists to protect. A client holding exactly one seat (a solo game against bots) redacts for that seat and sees its own purchases in full, as online |
| `bonus-paid` stays public | Who was paid which tier is **logged in full**, at every table | Money changing hands is public in the physical game — you watch the bank count it out — and the tier is what makes the merger legible. It does reveal relative standing in the defunct chain, which is why this is written down as a decision rather than left as an oversight in the same pass that closed the purchase leak ([#60](https://github.com/smromain/boomtown/issues/60)) |
| "The game has started" | A **durable marker**, not something inferred from the log ([#63](https://github.com/smromain/boomtown/issues/63)) | `start()` wrote nothing, so "dealt, nobody has moved yet" and "still in the lobby" were the same bytes in storage and a hibernation wake in that window resolved it as lobby — answering the opening move with "no game in progress". The marker rides the lobby key, which already exists for facts that are neither config nor commands. Logging the start as a `Command` instead would be one substrate and one replay path, but it moves the engine's command union, the protocol and every replay in the suite for a fact that is not a move |
| Build order | Engine first, offline before any server | Phase A proved the engine — especially the merger, where getting it wrong makes everything else moot. B was a fully offline hot-seat app, C bots, D the server, E packaging. That order is why the room could be a thin authority over an engine already trusted |
| Streaming mode (#62) | A per-machine setting that **masks the room code** in the host's lobby and the joiner's field; shown only while *Hold to show* is held; Copy works masked | The code travels by clipboard, so hiding it costs nothing, and a leaked code cannot be rotated. Characters are replaced, not blurred. Hold-to-show because a toggle can be left on by accident. The name means the code alone for now; a private window for the hand and decisions is designed in `plans/2026-09-24-feat-streaming-mode-design.md`, off by default and a separate setting when it comes |
| Couch mode (#62) | Hot-seat privacy goes to **phones**: the screen is a seat-less *table* with host authority, each seat is a thin phone page served by the room at `/phone/`, joined from a QR code | A private window cannot keep a hand private from people on the same couch; a phone can. The table sees only `tableView` (no seat's hand, cash or holdings) and events redacted for no reader. Room bots are paced by the table so beats are watched, capped at 20s. The phone reuses desktop copy and pure arithmetic rather than a second UI kit. Plan: `plans/2026-09-25-feat-couch-mode-plan.md` |

### The look

| Decision | Choice | Why |
|---|---|---|
| Visual direction | **Saxon City**, now simply "Boomtown" | Picked from three: Board Room (the board is the subject), Saxon City (the corporations are), Trading Floor (the money is). The other two are on the canvas's "Earlier directions" page |
| Board rendering | **Board View** (the tilted CSS grid) by default; **Skyline** (plain three.js) as a per-machine option | Skyline draws what the CSS board can't: every chain a district, its headquarters a tower that grows with the chain's size band, a crown when it is safe, a stripe for every company it has eaten. Both painters render one cell model and one DOM grid (`board/boardModel.ts`, `board/BoardGrid.tsx`); Skyline lays that grid transparent over its canvas with one CSS matrix, which an orthographic camera makes exact, so tests, the run-app driver and screen readers see the same board either way. The ~0.5 MB of three.js loads only when Skyline is picked, and anything that cannot draw it falls back to Board View. See **Superseded** for how this reverses a reversal ([#70](https://github.com/smromain/boomtown/issues/70)) |
| Moments | Six **beats**, driven off engine events | Founding, buy, merger, motion, endgame, victory, as timed skippable overlays with sound, rather than animation sprinkled through components. Five drop an opaque curtain; the buy flourish is deliberately light and never pauses play |
| Hot-seat privacy | An opaque hand-off card, **by construction** | The turn advances the instant a buy resolves, so anything that covers the screen defers the hand-off and anything that does not, does not. A light beat that got this wrong leaked the next player's hand for a second every turn |
| Copy | One file, `copy/constants.json` | Revising the writing is a pass through one file rather than a hunt across fifty components, and a phrase used twice cannot drift into two versions of itself |
| Launch backdrop | The **pixel-art town at night**, recoloured from `design/skyline.psd` | Replaced the drifting vector skyline. Four layers so the ranks can drift at different speeds while the moon and stars hold still; every colour mapped onto the palette by `design/make_skyline.py`, which fails rather than passing an unmapped colour through |
| The end screen | A **carousel of four frames** — standings, the per-turn graph, company by company, the awards — with back / play-pause / forward | It sits behind the victory beat's reveal and is what the table talks over, so it plays itself rather than waiting to be driven. A frame with an inner cycle holds for all of it: both cycles are one cursor, so the only thing moving is the innermost thing, and under `prefers-reduced-motion` nothing moves until somebody asks |
| Colourblind play | **One shared palette, glyphs beside every colour, and opt-in industry patterns** ([#19](https://github.com/smromain/boomtown/issues/19)) | The #18 palette already clears ΔE 15 under all three dichromacies, so a second CVD palette would only buy a chain that looks different to different players at one table. The real gaps were colour used alone: industry colours as type on paper (toys was 1.8:1) now take a legible shade from `game/industryTheme.ts`, and every tinted word or mark sits beside its glyph, because shades dark enough to read converge under deuteranopia. *Industry patterns* adds a texture per industry to the board, the caps and the merger discs; it is off by default, per machine, and switched from the game header as well as Settings |
| Seats have no colour | Identity is the **name, the row and the dash pattern** | A palette that is both colourblind-safe and distinct from the seven corporation colours does not exist at six seats — 12,000 candidates through the dataviz validator say so at ΔE 15, 12 and 10. The colour on these charts belongs to companies, which already own it |
| Ownership over time | A **line per seat**, never a stacked bar | A stack has to be ordered and every order is a lie for some part of the game: order by the final holding and a seat who led for twenty turns is drawn in the wrong step throughout; order it turn by turn and the bands cross every time the majority moves, which at six seats is most turns. Lines have nothing to order, and the crossing that broke the stack is the thing worth seeing |
| Settlement on the graph | **Off the line, in the legend** | The bank buys every share back and pays every bonus at once, which at a long table is more money than the whole game before it. Drawn as a data point it triples the axis and flattens forty turns into a line along the bottom with a spike on the end |
| Electron hardening | Isolation on, node off, sandbox on, strict CSP, fuses flipped | A narrow frozen `window.boomtown` bridge; CSP applied as a response header so it covers both the packaged `file://` load and the dev server; no `unsafe-eval` |

## Superseded

- **3D board → 2D CSS grid.** The original plan called for a "deliberately basic" top-down board in
  React Three Fiber. The design canvas always drew a flat grid, and reproducing it in R3F added a
  fixed-zoom camera, a font pipeline (troika) and ~2.2 MB of bundle. The grid fills its container
  via `aspect-ratio`, so it scales with the space. R3F, three and troika were removed.
  *Reversed in part (#70):* three.js is back, without R3F, drei or troika, as **Skyline**, an option
  beside the CSS board rather than instead of it. What changed is the job. The first 3D board
  reproduced a flat design at 2.2 MB; Skyline draws something the CSS board cannot (a city whose
  heights encode size, safety and lineage) at about a quarter of the weight, behind a lazy import.
  The coordinates are painted into a canvas texture with the app's own font, so there is no font
  pipeline. The design canvas has no Skyline artboard: the option is deliberately outside it, and the
  look lives in `board/skyline/scene.ts`.
- **The vote's notice period.** Designed as a turn's delay between raising a motion and voting on
  it; did not ship at any seat count. At three seats it hands the table a free turn to gerrymander
  the register against a mover who has just published it — a fourth cost on one action, when the
  likeliest failure of the whole design is that nobody ever calls a motion.
- **A fixed ⅔ quota at every seat count.** Measurement killed it: ⅔ carries 63% of motions at three
  seats and 6% at six, because coordinating a supermajority gets harder with every seat.
  `quotaBySeats` drops it to ½ at five and six.
- **Bots voting through the generic evaluator.** Made every bot vote yes and every motion carry at
  every quota, because settlement realises *everyone's* equity at full value. Replaced by
  `vote.ts`: a player votes on where they stand, not on their balance.
- **A two-tile mirrored drift track.** The launch backdrop's first version tiled two copies with the
  second mirrored and travelled one tile per cycle — which lands the loop on the opposite parity and
  jumps. It now travels two tiles of eight. Worth keeping because the verification was also wrong:
  sampling "100% of the cycle" with a negative animation delay reproduced the *start* frame.
- **One room code, doing both jobs.** See the addressing decision above.

## Open

### Product and legal

- **Trademark clearance.** Nothing in the pool has been searched. The mechanics are not protectable
  and can be implemented freely, but the names have not been cleared and should be before any real
  launch. Known to avoid: *Big Fish* (Big Fish Games publishes games), *Blockbusting* (a real-estate
  term with an ugly history). *Bigger Boat* was rejected as a Jaws quote.
- **The backwards Я in "Toys Я Were"** is Toys R Us trade dress rather than wordplay. The riskiest
  single element in the pool and the first thing to swap if anyone gets nervous.
- **Three pool names are not defunct.** BP, Netflix and Chuck E. Cheese are all still trading, so
  those rows are exceptions to the stated rule rather than examples of it. See `naming.md`.
- **The "riffing on" column** in `naming.md` and on the pool artboard is a design note. It must not
  ship as a string anywhere in the product.
- **Code signing.** Both signing paths are wired in `release.yml` and neither secret is set, so
  macOS players need the `xattr` step and Windows shows SmartScreen. A certificate is a purchase
  decision, not a code one.
- **No update feed.** `updater.ts` degrades cleanly and store-managed distributions stand down
  (`distribution.ts`), but nothing is configured, so a released build never learns about a newer
  one. GitHub Releases as the feed is the obvious candidate.
- **itch.io account identity as a trust signal on host admission.** Deferred with a named revisit
  trigger in `plans/2026-09-14-feat-web-deployment-plan.md`; the game is pay-what-you-want, so most
  players will have no purchase to prove. Revisit only if a hosted public deployment happens.

### Technical

- **The end-of-game record is rebuilt by replaying the whole log.** `retrospective()` runs
  `reduce` once per command at settlement, which is one pass over a few hundred commands and has
  never been measurable — but it is O(log) on a thread that also has to paint the end screen. If a
  very long game ever stutters there, the answer is to fold it forward as the game is played rather
  than to store it: the log stays the substrate either way.
- **The room's bots are handed authoritative state.** `runBots` calls
  `policy.chooseMove(this.state, …)` where the local driver passes
  `beliefState(options.snapshot(), …)`. So online bots can read hidden holdings — `bonusExposure` in
  `queries/evaluate.ts` does map over `state.seats` — which at a closed table they should not. Hands
  and the bag are not read into any score, and that is structural rather than lucky (`ownMoves`
  filters to the bot's own commands and `scoreMove` stops recursing once the decider is another
  seat), but nothing enforces it: deepen the lookahead and the hands are right there in the
  parameter. The fix is the rule already stated — a bot sees what a player at that table could see —
  applied in `game-room.ts` as it already is in `bots.ts`.
- **The design canvas shows companies that are not in the game.** `design/build.py` carries its own
  older `POOL` — Woolyworth, Compuwas, Pan-Atlas, Braniffle, Texicorps, Wattage, Megahit Video,
  Tower of Records — and the artboards are generated from it. `packages/engine/src/pool.ts` is the
  pool of record. Reconciling means editing `build.py`, regenerating and republishing.
- **`mergeNaming.stem` value.** 0.75 as specified; 0.6 drifts names further from where they started.
  Playtest rather than decide.
- **2015 board dimensions**, if that preset is ever wanted for real. The rulebook does not say.
- **The 2015 corporation names** live on info-card artwork, which is an image in the PDF. Only
  *Etch* and *Bolt* appear in the worked examples. Not needed unless that preset ships with its own
  names.
- **Two orphan release-candidate tags** (`v2026.9.1-rc1`, `v2026.9.1-rc2`) are still on the remote;
  deleting a ref is blocked from the agent environment.

## Things that bit — worth not rediscovering

- **The 2015 secondary bonus column is not a formula.** Primary is 10× share price and tertiary is
  5×, but secondary (1500, 2200, 3000, 3700, 4200, 5000, 5700, 6200, 7000, 7700, 8200) fits no
  multiplier. It ships as a lookup table, verified against the rulebook's worked example.
- **A naive syllable splitter returns whole words.** `Transworldly` and `Sizzle's` both yielded
  themselves as fragments, which swamps the stem. Fixed with a VCCV split rule, a 3–6 letter clamp,
  and skipping one-character words. All 28 names were re-checked, not just the seven in play.
- **The board badge stays stable for free**, because the stem is always taken from the front. Worth
  keeping as a deliberate constraint rather than an accident.
- **The motion was unreachable when first built**, and twenty engine tests missed it because they
  set the turn step by hand: `finishTurn` only held at end-check when an end condition was met, and
  a motion is legal only while one is *not*.
- **Suppressing purchase detail outright blinds the mover too.** They must judge whether the quota
  is reachable *before* publishing the register that would tell them. Naming the corporation but not
  the quantity keeps the electorate's shape estimable while the weights stay secret.
- **A plain majority vote is not worth building.** Ending the game freezes variance, and variance is
  the only route to first for anyone not already there, so every trailing player votes to continue.
  Weighting by shareholding is what makes it a decision; a supermajority is what stops the leader
  self-serving.
- **Rate limits calibrated against a person punish a client.** 8/s and then 30/s both stalled the
  integration suite, which plays a whole game over a socket with no pacing. The burst has to cover a
  game, not a turn.
- **A test can pass against a mock of the thing that is wrong.** `afterPack.test.ts` mocks
  `executableName`, so a Linux binary named `@boomtowndesktop` shipped with itch manifests pointing
  at a file that did not exist.
- **macOS Gatekeeper's "damaged" refusal needs the quarantine flag**, which a *browser* applies.
  The itch app extracts its own download, so Gatekeeper is never invoked on that path — which is why
  the itch install needs no `xattr` step and the direct download does.
- **`vars.*` in a workflow only reads the Variables tab.** A value set as a secret, or under
  Settings → Environments, resolves empty with no error. `vars.X || secrets.X` covers two of the
  three.
- **An `aria-label` that contains another element's label matches both.** `"Copy the room code"`
  contains `"Room code"`, so `getByLabel('Room code')` stopped being unique and broke a driver
  script.
