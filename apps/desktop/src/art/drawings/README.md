# Boomtown drawings

These are the illustrations from Boomtown's Game Night look, one SVG per drawing.

| Folder | What | Canvas |
|---|---|---|
| `cards/` | The scene on each company's card, one per industry | 300 × 96 |
| `mergers/` | The merger picture, in parts: `backdrop`, one `hq-` building per industry (the company that survives), the `crane`, one `load-` per industry (the company being taken over, hanging from the crane), and the `swing-arrow` | 600 × 150; each `load-` is 92 × 80 |
| `portraits/` | The players' heads | 40 × 40 |

A merger picture is put together from its parts in the game: the backdrop, a headquarters, the
crane, and a load hung from the crane's hook and swinging. To see a part in place, open the
backdrop, a headquarters and the crane together; they share one canvas. A load's slings meet the
hook at the top of its canvas.

## Touching them up

- **Keep each canvas the same size and shape**, and keep the file names. Artwork may go past the
  edge of the canvas; it will be cut off in the game.
- **Use the colours in `palette.svg`** (listed in `palette.json`). Each one stands for a role, not
  just a colour: the game swaps them for the night-time palette, and the company colour
  (teal `#2a9d8f`) and the taken-over company's colour (orange `#e76f51`) become whichever company
  is on screen. Use those exact values wherever the colour should follow along. Any other colour
  stays exactly as you draw it, day and night.
- **Shapes only.** Convert text to outlines, and don't embed pictures. Gradients are fine.
- **Outlines** are `#1c2a47`, mostly 2 wide (thinner for detail), with round ends and joins. The
  game adds a slight hand-drawn wobble to every line, so there is no need to draw one in.
- **Save as plain SVG** (Illustrator: *File › Export › Export As… › SVG*, or *Save As › SVG*;
  Inkscape: *Plain SVG*). Styling as attributes or as a style block both work.

## Bringing them back (for the developer)

```bash
npm run art:export                 # writes the drawings with plain colours, plus these notes, to art-kit/
npm run art:import -- <folder>     # takes a touched-up folder back into this one
```

The import puts the colour roles back (`var(--gn-*)`), undoes what the editor added (metadata,
style classes, layer groups, a moved or rescaled canvas), and reports, per drawing, whether it
changed and any colour that matches no role. It refuses text, embedded pictures and a canvas of a
different shape. Files may come back flattened into one folder; they are matched by name. Check the
result in the app before committing: the files are the source, and `drawings.ts` loads them.
