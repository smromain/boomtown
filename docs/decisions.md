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

## Open

- **Trademark clearance.** Nothing in the pool has been searched. The mechanics are not
  protectable and you can implement them freely, but the names have not been cleared and should be
  before launch. Known to avoid: *Big Fish* (Big Fish Games publishes games), *Blockbusting* (real
  estate term with an ugly history). *Bigger Boat* was rejected as a Jaws quote.
- **The backwards Я in "Toys Я Were"** is Toys R Us trade dress rather than wordplay. It is the
  riskiest single element in the pool and the first thing to swap if anyone gets nervous.
- **The "riffing on" column** in `naming.md` and on the pool artboard is a design note so the list
  can be reviewed. It must not ship as a string anywhere in the product.
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
