# Screenshots

Seventeen frames from one real game, in the order a table meets them — for
press, the README, a store page, anywhere the game needs to be shown rather
than described.

| File | What it shows |
|---|---|
| `01-title-screen.png` | Title screen — local game or a room to join |
| `02-new-game.png` | Setup: the three editions, seats, closed books |
| `03-hot-seat-handoff.png` | The hand-off card between two human seats |
| `04-first-turn.png` | Turn one — empty board, six playable tiles |
| `05-founding-prompt.png` | Choosing which name comes out of the tray |
| `06-a-corporation-is-founded.png` | The founding beat: headquarters, price, founder's share |
| `07-buy-stock.png` | Buying up to three shares, with the bank's stock shown |
| `08-the-table-mid-game.png` | The whole screen mid-game: cards, board, story, shareholders |
| `09-merger-at-9g.png` | The merger sequence opening on the tile that caused it |
| `10-choosing-the-survivor.png` | The mergemaker breaking a tie between equal corporations |
| `11-the-merged-name.png` | The accreted display name of a survivor |
| `12-disposing-of-dead-stock.png` | Hold, sell or trade two-for-one, with bonuses paid |
| `13-end-of-turn.png` | End of turn: end turn, or move to liquidate |
| `14-motion-to-liquidate.png` | The vote, with the register tallying shares live |
| `15-the-motion-fails.png` | A failed motion — the backer plays on with open books |
| `16-tallying-the-score.png` | Final scoring, counted up from last place |
| `17-final-standings.png` | Game over: cash, stock and total per seat |

## Web copies

The README embeds half-size WebP copies from `web/` rather than these PNGs --
1600 x 1000 at quality 88, about 600 KB for all seventeen against 8.3 MB of
originals. Regenerate them after retaking anything:

```bash
python3 docs/screenshots/make_web_copies.py   # needs Pillow
```

The PNGs here stay the masters: link those anywhere the full resolution matters.

## How they were taken

The renderer served to a browser (`cd apps/desktop && npm run web`) and driven
with Playwright — an all-bot table for the set pieces that arrive on their own,
a played seat for the prompts only a human sees, and a two-human table for the
hand-off card, which does not otherwise exist. Boomtown preset, three seats,
viewport 1600 × 1000 at 2× (so 3200 × 2000 PNGs).

Four things to know if you retake them:

- **Screenshot the viewport, not the full page.** `fullPage: true` extends past
  the viewport while a fixed overlay does not, so beats and modals come out
  half-painted over a stretch of board.
- **Wait for the overlay to settle.** Beats fade and stage; a frame grabbed on
  the transition catches text mid-fade. Sample, wait ~1.5s, confirm the same
  overlay is still up, then shoot.
- **A corporation's flavour line scrolls.** It is a vertical `Marquee`, so a
  blended flavour long enough to overflow its two-line window is usually caught
  mid-scroll. Take a later frame rather than assume the card is broken.
- **Set pieces are not on demand.** A motion, a tie-break for the survivor and a
  multi-corporation merger arrive when the bots produce them, so a run can end
  without one. Gate the capture on the state you want and re-run.

A published sheet of all seventeen, laid out in play order:
https://claude.ai/code/artifact/f3488e6b-8bd6-41d1-9a50-7693a49d6731
