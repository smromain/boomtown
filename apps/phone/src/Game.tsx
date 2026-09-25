import { useEffect, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { INDUSTRIES, type Command, type Seat, type TileId } from '@boomtown/engine';
import type { ClientView, GameClient } from '@boomtown/client-core';
import { copy, fill } from '@desktop/copy/copy.js';
import { BuySheet, DisposeSheet, EndTurnSheet, FoundSheet, PickSheet, VoteSheet } from './sheets.js';
import { describeTile } from './tiles.js';
import { Swatch } from './Swatch.js';

const p = copy.phone;
const STEP: Record<string, string> = {
  place: copy.game.waiting.steps.place,
  found: copy.game.waiting.steps.found,
  merge: copy.game.waiting.steps.merge,
  buy: copy.game.waiting.steps.buy,
  'end-check': copy.game.waiting.steps.endCheck,
  vote: copy.game.waiting.steps.vote,
};

/**
 * One seat's game, on a phone (#62): cash, the hand with what each tile would
 * do, the shares held, and — when the game is waiting on this seat — the one
 * thing it is waiting for.
 *
 * Everything is read from this seat's own view. The pick-one screens (place,
 * found, survivor, defunct order, vote, end of turn) are the room's legal moves
 * put into words; buying and disposal are built from the view and the ruleset,
 * and the room's `reduce` refuses anything wrong, as it does for every client.
 */
export function Game({ client, seat, children }: { client: GameClient; seat: Seat; children?: ReactNode }) {
  const view = useStore(client.store, (state) => state.views[seat] ?? null);
  const busy = useStore(client.store, (state) => state.inFlight != null);
  const error = useStore(client.store, (state) => state.lastError);
  const send = (command: Command) => client.dispatch(command);

  if (!view) {
    return (
      <main className="phone">
        {children}
        <p className="status">{copy.lobby.connecting}</p>
      </main>
    );
  }

  const me = view.seats[seat]!;
  const decision = view.pendingDecision;
  const mine = view.status === 'playing' && (decision != null || view.activeSeat === seat);

  return (
    <main className="phone game" aria-busy={busy}>
      {children}
      <header className="seatbar">
        <div>
          <span className="kicker">{fill(p.seatLabel, { n: seat + 1 })}</span>
          <div className="serif name">{me.name}</div>
        </div>
        <div className="cash">
          <span className="kicker">{p.cash}</span>
          <div className="tabnum">${view.yourCash.toLocaleString()}</div>
        </div>
      </header>

      {error && (
        <p className="error" role="alert">
          {error.message}
        </p>
      )}

      {view.status === 'over' ? (
        <Standings view={view} />
      ) : mine ? (
        <Turn view={view} busy={busy} send={send} />
      ) : (
        <section className="card watching" aria-live="polite">
          <div className="serif">{view.seats[view.activeSeat]?.name}</div>
          <div>{fill(copy.game.waiting.doing, { name: '', doing: STEP[view.step] ?? copy.game.waiting.steps.fallback }).trim()}</div>
          <span className="kicker">{p.watchTable}</span>
        </section>
      )}

      {/* The rack stays on screen whoever's turn it is — you plan a turn you
          can see (#61) — but it is only ever tappable on the place step. */}
      {view.status === 'playing' && !(mine && view.step === 'place' && !decision) && <Rack view={view} />}
      <Shares view={view} />
    </main>
  );
}

function Turn({ view, busy, send }: { view: ClientView; busy: boolean; send: (c: Command) => void }) {
  const decision = view.pendingDecision;
  const you = view.you;

  if (decision) {
    switch (decision.type) {
      case 'dispose-shares':
        return <DisposeSheet view={view} decision={decision} busy={busy} send={send} />;
      case 'cast-vote':
        return <VoteSheet view={view} decision={decision} busy={busy} send={send} />;
      case 'choose-survivor':
        return (
          <PickSheet
            title={copy.decisions.survivor.title}
            options={decision.options}
            view={view}
            busy={busy}
            onPick={(survivor) => send({ type: 'choose-survivor', seat: you, survivor })}
          />
        );
      case 'choose-defunct-order':
        return (
          <PickSheet
            title={copy.decisions.defunctOrder.title}
            options={decision.options}
            view={view}
            busy={busy}
            onPick={(next) => send({ type: 'choose-defunct-order', seat: you, next })}
          />
        );
    }
  }

  switch (view.step) {
    case 'place':
      return <PlaceTile view={view} busy={busy} send={send} />;
    case 'found':
      return <FoundSheet view={view} busy={busy} send={send} />;
    case 'buy':
      return <BuySheet view={view} busy={busy} send={send} />;
    case 'end-check':
      return <EndTurnSheet view={view} busy={busy} send={send} />;
    default:
      return (
        <section className="card">
          <p className="status">{p.sending}</p>
        </section>
      );
  }
}

/**
 * Pick a tile, then place it: two taps, so a thumb brushing the rack can never
 * commit a merger.
 */
function PlaceTile({ view, busy, send }: { view: ClientView; busy: boolean; send: (c: Command) => void }) {
  const [picked, setPicked] = useState<TileId | null>(null);
  const turn = `${view.you}:${view.step}:${view.handTiles.map((h) => h.tile).join()}`;
  useEffect(() => setPicked(null), [turn]);

  const playable = view.legalMoves.filter((m) => m.type === 'place-tile').map((m) => m.tile);
  const chosen = view.handTiles.find((h) => h.tile === picked) ?? null;

  return (
    <section className="card turn" aria-label={p.yourTurn}>
      <span className="kicker accent">{p.yourTurn}</span>
      <h2 className="serif">{copy.game.waiting.steps.place}</h2>
      <Rack view={view} picked={picked} onPick={(tile) => setPicked(tile)} playable={playable} />
      {playable.length === 0 ? (
        <>
          <p className="note">{p.noPlayable}</p>
          <button type="button" className="primary" disabled={busy} onClick={() => send({ type: 'end-turn', seat: view.you })}>
            {p.skipTurn}
          </button>
        </>
      ) : chosen ? (
        <>
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => send({ type: 'place-tile', seat: view.you, tile: chosen.tile })}
          >
            {fill(p.place, { tile: chosen.tile })}
          </button>
          <p className="note">
            {describeTile(view, chosen)}
            {chosen.effect === 'merge' ? ` ${p.mergerOnTable}` : ''}
          </p>
        </>
      ) : (
        <p className="note">{p.pickTile}</p>
      )}
    </section>
  );
}

function Rack({
  view,
  picked,
  onPick,
  playable,
}: {
  view: ClientView;
  picked?: TileId | null;
  onPick?: (tile: TileId) => void;
  playable?: readonly TileId[];
}) {
  return (
    <section className="rack" aria-label={p.yourTiles}>
      <span className="kicker">{p.yourTiles}</span>
      <ul>
        {view.handTiles.map((hand) => {
          const can = playable?.includes(hand.tile) ?? false;
          return (
            <li key={hand.tile}>
              <button
                type="button"
                className="tile"
                data-effect={hand.effect}
                aria-pressed={picked === hand.tile}
                disabled={!onPick || !can}
                onClick={() => onPick?.(hand.tile)}
              >
                <span className="tileId serif">{hand.tile}</span>
                <span className="chip">{p.effects[hand.effect]}</span>
                <span className="what">{describeTile(view, hand)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Shares({ view }: { view: ClientView }) {
  const held = INDUSTRIES.filter((industry) => view.yourHoldings[industry] > 0);
  return (
    <section className="shares" aria-label={p.yourShares}>
      <span className="kicker">{p.yourShares}</span>
      {held.length === 0 ? (
        <p className="note">{p.noShares}</p>
      ) : (
        <ul>
          {held.map((industry) => (
            <li key={industry}>
              <Swatch industry={industry} />
              <span className="corp">{view.corporations[industry].displayName}</span>
              <span className="tabnum">{view.yourHoldings[industry]}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Standings({ view }: { view: ClientView }) {
  const g = copy.game.gameOver;
  return (
    <section className="card" aria-label={g.label}>
      <span className="kicker">{p.gameOver}</span>
      <ol className="standings">
        {(view.result?.rankings ?? []).map((row) => (
          <li key={row.seat} data-you={row.seat === view.you || undefined}>
            <span>{view.seats[row.seat]?.name}</span>
            <span className="tabnum">{fill(p.finalCash, { cash: row.total.toLocaleString() })}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
