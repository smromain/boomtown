# Plans

The four plans the project was built from, newest last. A delivered plan is read for its
*reasoning* — the alternatives weighed, the traps predicted — not as instructions; where it
disagrees with the current documents, the current documents are right.

| Plan | Date | Status |
|---|---|---|
| [`2026-09-06-1315-feat-boomtown-architecture-plan.md`](2026-09-06-1315-feat-boomtown-architecture-plan.md) | 2026-09-06 | **Delivered.** 20 units across five phases (engine → offline hot-seat → bots → server → packaging), KTD1–12, and the verification contract. Two calls in it were later reversed: the 3D board, and one room code doing two jobs |
| [`2026-09-07-0631-refactor-online-multiplayer-substrate-plan.md`](2026-09-07-0631-refactor-online-multiplayer-substrate-plan.md) | 2026-09-07 | **Delivered.** Why PartyKit over a hand-rolled `ws` server, Colyseus or boardgame.io; the room-per-game shape; hibernation and command-log replay |
| [`2026-09-07-2020-feat-game-feel-presentation-plan.md`](2026-09-07-2020-feat-game-feel-presentation-plan.md) | 2026-09-07 | **Delivered.** The beats, the sound, the hand-off card, the corporation band, and the canvas work that went with them |
| [`2026-09-14-feat-web-deployment-plan.md`](2026-09-14-feat-web-deployment-plan.md) | 2026-09-14 | **Partially delivered.** R1–R25, KTD14–22, U21–U33 and a threat model for a room reachable from a public URL. Its security units **U26–U30 shipped** (seat tokens, addresses and tickets, host admission, frame validation and rate limits, room ceilings and expiry). The hosted web build itself has not been built |

The architecture plan's own authority hierarchy still holds: `../rules.md` and `../naming.md` are
the rules authority; a plan owns architecture and sequencing within its own scope.

## Unit and decision numbering

The `U*` and `KTD*` labels are referenced from code comments and commit messages — `U27` in a commit
subject means that unit of the web-deployment plan, and `KTD9` in `afterPack.mjs` means that key
technical decision of the architecture plan. That is why these files stay put rather than being
folded into the current documents: the labels are a shared vocabulary the history depends on.
