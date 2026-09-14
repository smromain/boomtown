# Screenshots

Sixteen frames from one real game, in the order a table meets them — for press,
the README, a store page, anywhere the game needs to be shown rather than
described.

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
| `09-merger-at-4a.png` | The merger sequence opening on the tile that caused it |
| `10-the-merged-name.png` | The accreted display name of a survivor |
| `11-disposing-of-dead-stock.png` | Hold, sell or trade two-for-one, with bonuses paid |
| `12-end-of-turn.png` | End of turn: end turn, or move to liquidate |
| `13-motion-to-liquidate.png` | The vote, with the register tallying shares live |
| `14-the-motion-fails.png` | A failed motion — the backer plays on with open books |
| `15-tallying-the-score.png` | Final scoring, counted up from last place |
| `16-final-standings.png` | Game over: cash, stock and total per seat |

## How they were taken

The renderer served to a browser (`cd apps/desktop && npm run web`) and driven
with Playwright — an all-bot table for the set pieces that arrive on their own,
a played seat for the prompts only a human sees. Boomtown preset, three seats,
viewport 1600 × 1000 at 2× (so 3200 × 2000 PNGs).

Two things to know if you retake them:

- **Screenshot the viewport, not the full page.** `fullPage: true` extends past
  the viewport while a fixed overlay does not, so beats and modals come out
  half-painted over a stretch of board.
- **Wait for the overlay to settle.** Beats fade and stage; a frame grabbed on
  the transition catches text mid-fade. Sample, wait ~1.5s, confirm the same
  overlay is still up, then shoot.

A published sheet of all sixteen, laid out in play order:
https://claude.ai/code/artifact/f3488e6b-8bd6-41d1-9a50-7693a49d6731
