# History

Archival. Nothing here is maintained, and where any of it disagrees with a document in `../`, the
current document is right. It is kept because a diagnosis is often more useful than the fix it led
to — the next person to see the same symptom wants the reasoning, not just the patch.

| File | What it is |
|---|---|
| [`initial-design-doc.md`](initial-design-doc.md) | The original design document, written before any code existed. The project's starting position on theme, mechanics and scope |
| [`phase-d-review-followups.md`](phase-d-review-followups.md) | The review follow-up list from the server phase. Its items are either done or have moved into `../decisions.md` |
| [`handoffs/`](handoffs/) | Five session handoffs from 2026-09-08/09, each recording what a session diagnosed and what landed |

## The handoffs

Read them for the bugs, which are the kind that recur:

| Handoff | The bug worth remembering |
|---|---|
| [`2026-09-09-hotseat-buystock-beat-leak.md`](handoffs/2026-09-09-hotseat-buystock-beat-leak.md) | `TurnHandoff` stood down for *any* active beat — a rule written for the four full-screen beats, where deferring is safe because nothing behind an opaque curtain leaks. The light buy flourish is not a curtain, so it showed the next player's hand for a second every turn |
| [`2026-09-09-hotseat-and-merger-readability-fixes.md`](handoffs/2026-09-09-hotseat-and-merger-readability-fixes.md) | What actually landed for that leak, plus disposal pricing and bonus-tier wording |
| [`2026-09-09-online-lobby-stuck-and-net-logging.md`](handoffs/2026-09-09-online-lobby-stuck-and-net-logging.md) | "Waiting for the room…" forever: `socketTransport` fired `room-state` before anyone was listening. The transport now holds the last room state and replays it on subscribe — and this is why the netlog exists |
| [`2026-09-09-three-triage-items.md`](handoffs/2026-09-09-three-triage-items.md) | Three bugs recorded as diagnosis-plus-proposed-fix rather than implemented, all since done |
| [`2026-09-08-game-feel-presentation-plan.md`](handoffs/2026-09-08-game-feel-presentation-plan.md) | The session that wrote the game-feel plan; the plan itself is in `../plans/` |

Note that the handoffs' internal paths predate this reorganisation: a reference to
`docs/handoffs/…` now means `docs/history/handoffs/…`, and `docs/initial-design-doc.md` means
`docs/history/initial-design-doc.md`.
