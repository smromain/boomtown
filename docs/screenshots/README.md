# Screenshots

Eleven frames in the Game Night look, the set on the itch.io page, in the order
a table meets them — for press, the README, a store page, anywhere the game
needs to be shown rather than described.

| File | What it shows |
|---|---|
| `01-title-screen.png` | Title screen: a local game, a room online, or a couch game |
| `02-the-table-by-day.png` | The table late in a game, by day |
| `03-the-table-by-night.png` | The same table at night |
| `04-a-company-is-founded.png` | The founding beat: headquarters, price, founder's share |
| `05-buy-stock.png` | Buying up to three shares, with the bank's stock shown |
| `06-a-merger.png` | The merger beat: the crane moves one company into the other |
| `07-disposing-of-shares.png` | Keep, sell or trade two-for-one, with bonuses paid |
| `08-tracking-the-market.png` | After the game: every seat's net worth, turn by turn |
| `09-awards.png` | After the game: the awards |
| `10-skyline-by-day.png` | The 3D Skyline board by day |
| `11-skyline-by-night.png` | The 3D Skyline board at night |

## Web copies

The README embeds WebP copies from `web/` rather than these PNGs --
1600 x 900 at quality 88, about 820 KB for all eleven against 4.6 MB of
originals. Regenerate them after retaking anything:

```bash
python3 docs/screenshots/make_web_copies.py   # needs Pillow
```

The PNGs here stay the masters: link those anywhere the full resolution matters.

## How they were taken

The renderer served to a browser (`cd apps/desktop && npm run web`) and driven
with Playwright — an all-bot table for the set pieces that arrive on their own,
and a played seat for the prompts only a human sees. Boomtown preset, four and
five seats, viewport 1920 × 1080 at 1×, in day and night. The Skyline frames
switch the board with the top bar's board toggle.

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
