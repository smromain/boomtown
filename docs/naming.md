# Boomtown — corporations and merged names

## The concept

Every company in the pool was once the biggest thing in its category and then got eaten — which is
the only thing that happens on this board. The parody targets are **defunct** brands, deliberately:
lower risk than live ones, and a better joke, because the theme rhymes with the mechanic.

## The pool

A game draws **one company per industry**, so there are always seven, always one of each, and the
industry marks stay unique on the board. **Tier and colour belong to the industry, not the
company** — swapping a name in or out cannot affect balance. Adding a name means adding a row.

7 industries × 4 candidates = **16,384 possible line-ups.**

### Books & retail — tier 1, `#D7A329`

| Name | Flavour | Fragment | Stem | Riffing on *(design note — never ships)* |
|---|---|---|---|---|
| Chapter Eleven **← drawn** | books, coffee, denial | `ven` | `Chapterele` | Borders |
| Woolyworth | everything, sort of, cheap | `worth` | `Woolywor` | Woolworth |
| Seers Roebeck | the catalogue was the internet | `beck` | `Seersroeb` | Sears Roebuck |
| Waldenbust | the finest bookstore at your local airport | `bust` | `Waldenbu` | Waldenbooks |

### Electronics — tier 1, `#C64E25`

| Name | Flavour | Fragment | Stem | Riffing on *(design note — never ships)* |
|---|---|---|---|---|
| Radio Hut **← drawn** | batteries, phones and $70 HDMI cables | `hut` | `Radioh` | RadioShack |
| Circuit Village | the warranty is the product | `lage` | `Circuitvil` | Circuit City |
| Compuwas | beige boxes, bold promises | `was` | `Compuw` | CompUSA |
| Fried Electronics | an aisle of cables you don't need | `nics` | `Friedelectro` | Fry's |

### Air travel — tier 2, `#355C99`

| Name | Flavour | Fragment | Stem | Riffing on *(design note — never ships)* |
|---|---|---|---|---|
| Pan-Atlas **← drawn** | the glamour of air travel | `las` | `Panatl` | Pan Am |
| Transworld Air | wings over everywhere | `air` | `Transworld` | TWA |
| Braniffle | the plane is painted orange | `niffle` | `Braniff` | Braniff |
| Concordia | there at breakfast, broke by lunch | `dia` | `Concord` | Concorde |

### Energy — tier 2, `#4A9471`

| Name | Flavour | Fragment | Stem | Riffing on *(design note — never ships)* |
|---|---|---|---|---|
| Enrun **← drawn** | energy, creatively accounted | `run` | `Enru` | Enron |
| Texicorps | a star, a pump, a lawsuit | `corps` | `Texicor` | Texaco |
| Standard Oyl | too big, then thirty-four pieces | `oyl` | `Standard` | Standard Oil |
| Wattage | power, unapologetically | `tage` | `Watta` | generic utility |

### Devices & web — tier 2, `#AC7CEF`

| Name | Flavour | Fragment | Stem | Riffing on *(design note — never ships)* |
|---|---|---|---|---|
| Blackcurrant **← drawn** | the keyboard people | `rant` | `Blackcurr` | BlackBerry |
| Noquia | indestructible, briefly essential | `quia` | `Noqu` | Nokia |
| Palmistry | the future, in your palm, in 1998 | `mistry` | `Palmist` | Palm |
| Netscapade | we were the internet once | `pade` | `Netscapa` | Netscape |

### Video & film — tier 3, `#971D50`

| Name | Flavour | Fragment | Stem | Riffing on *(design note — never ships)* |
|---|---|---|---|---|
| Megahit Video **← drawn** | be kind, rewind | `deo` | `Megahitvi` | Blockbuster |
| Tinseltown Video | new releases and 42 copies of 'Next Friday' | `deo` | `Tinseltownv` | Hollywood Video |
| Fotomatic | one hour, one kiosk, one photo | `tic` | `Fotomat` | Fotomat |
| Tower of Records | listening booths, teenage employees and no returns | `cords` | `Towerofrec` | Tower Records |

### Toys — tier 3, `#66CAD8`

| Name | Flavour | Fragment | Stem | Riffing on *(design note — never ships)* |
|---|---|---|---|---|
| Toys Я Were **← drawn** | where a kid was a customer | `were` | `Toyswe` | Toys R Us |
| Kaybee Toyworks | the mall's loudest storefront | `works` | `Kaybeetoyw` | KB Toys |
| Chuck E. Wheeze | animatronics and birthday grief | `wheeze` | `Chuckewhe` | Chuck E. Cheese |
| Discovery Zonked | a ball pit of uncertain hygiene | `ked` | `Discoveryzo` | Discovery Zone |

## Merged names

When a corporation acquires another it keeps three quarters of its own name and appends a fragment
of what it swallowed. **The name never resets and never truncates.**

- **Stem** — 75% of the base name, ASCII letters only, taken **once at founding** and never
  shortened again. This is what keeps the badge letter and the identity stable.
- **Fragment** — the last syllable of the last real word of the acquired corporation's *current
  display name*, clamped to 3–6 letters. Words of one character (a possessive `'s`) are skipped.
- **Seam** — a doubled letter where a fragment joins is collapsed.
- **Display name** = stem + every fragment, in acquisition order. **Derived, never stored.**
  A corporation is a base name plus an ordered list of what it ate; changing the rule re-renders
  history instead of corrupting it.

### One game, played out

| # | Survivor | Swallows | Becomes | Letters | Slots |
|---|---|---|---|---|---|
| 1 | Megahit Video | Pan-Atlas | **Megahitvilas** | 12 | 2 |
| 2 | Blackcurrant | Enrun | **Blackcurrun** | 11 | 2 |
| 3 | Megahitvilas | Radio Hut | **Megahitvilashut** | 15 | 3 |
| 4 | Megahitvilashut | Chapter Eleven | **Megahitvilashutven** | 18 | 4 |
| 5 | Megahitvilashutven | Blackcurrun | **Megahitvilashutvenrun** | 21 | 6 |

Final flavour on that card:

> *be kind, rewind · the glamour of air travel · batteries, phones and $70 HDMI cables · books, coffee, denial · the keyboard people · energy, creatively accounted*

### Flavour accretes too — and differently

**The name takes one fragment from what it swallowed; the flavour takes everything that was in
there.** When the survivor ate a corporation that had itself already eaten one, it added a single
fragment to the name but inherited *both* flavour lines. The name compresses history; the flavour
keeps all of it.

### What the rule must respect

- **Two names, always.** `baseName` belongs to the headquarters marker and never changes. Held
  defunct stock, refounding and the board badge all key off it. Only `displayName` accretes.
- **Refounding resets.** A returned headquarters comes back under its own name. A player holding
  stock from four mergers ago is holding *that company's* stock.
- **The badge never moves.** The stem is taken from the front, so the initial on the headquarters
  tile is fixed for the whole game. Colour is fixed for the same reason — neither derives from the
  display name.
- **Multi-mergers append twice.** A tile joining three corporations resolves defunct chains
  largest-first and appends one fragment per defunct, in that order.
- **A blocklist is not optional.** Concatenating fragments of seven brands will eventually produce
  something unshippable. Check the assembled result and fall back to the next syllable boundary,
  never to the unblended name.

### Length is solved by the cards, not by truncation

The corporation band shows **one card per active corporation, one slot wide per corporation it
contains** (itself plus everything it has swallowed). The band's total width never changes; the
cards get fatter as the market consolidates. A corporation has exactly as much room for its name
and its flavour as it has earned — the six-slot endgame card holds a 21-letter name and six
flavour clauses comfortably. Defunct headquarters move to an "in the tray" strip, free to be
founded again.

## Configuration

| Key | Default | Meaning |
|---|---|---|
| `mergeNaming.enabled` | `true` | off entirely, and survivors keep their own names |
| `mergeNaming.stem` | `0.75` | share of the base name kept, from the front, computed once |
| `mergeNaming.fragment` | `lastSyllable` | or a flat character count |
| `mergeNaming.minFragment` | `3` | letters, so a one-syllable name still contributes |
| `mergeNaming.maxFragment` | `6` | letters, so a long word cannot swamp the stem |
| `mergeNaming.collapseSeam` | `true` | drop a doubled letter where a fragment joins |
| `mergeNaming.flavour` | `concat` | the survivor inherits every flavour line it swallowed |
| `pool.onePerIndustry` | `true` | seven drawn per game, one from each industry |

Lowering `stem` toward 0.6 makes names drift further from where they started. Worth playtesting,
not deciding up front.

## Reference implementation

`design/build.py` contains working Python for `stem()`, `fragment()`, `_syls()` and
`display_name()`, plus `game_lineage()` which replays a whole game. The table above is generated
from that code, not transcribed — port it rather than reimplementing from this prose.
