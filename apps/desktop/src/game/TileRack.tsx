import { useEffect } from 'react';
import type { HandTileEffect } from '@boomtown/client-core';
import { setRackPreview, useRackPreview } from '../board/rackPreview.js';
import { useGameClient, useGameState } from '../client/GameClientProvider.js';
import { useOwnView } from '../client/ownView.js';
import styles from './game.module.css';
import { copy } from '../copy/copy.js';
import { useTutorialHint } from '../tutorial/TutorialContext.js';

const EFFECT_LABEL: Record<HandTileEffect, string> = {
  nothing: 'idle',
  found: 'found',
  grow: 'grow',
  merge: 'merge',
  dead: 'dead',
  blocked: 'blocked',
};

/**
 * The tile rack from the Main artboard: rounded squares with the coordinate and
 * its effect.
 *
 * It stays on screen while somebody else is on the clock (#61), which is most
 * of the game — you cannot plan a turn you cannot see your hand for. The effect
 * labels stay live off-turn too, so a tile of yours going `dead` as an opponent
 * plays is something you watch happen rather than discover on your next turn.
 *
 * Two things this has to get right:
 *
 * **Entitlement is `useOwnView`, never the active view.** A hot-seat client
 * holds a view for every seat, bots included, so a rack reading the seat on the
 * clock would deal out the whole table's hands over one turn cycle. `useOwnView`
 * answers "which seat may this screen read private state from" — the same hook
 * `Shareholders` uses, and for the same reason. A spectator gets an empty hand
 * and so renders nothing at all.
 *
 * **Off-turn it is inert, and neither `step` nor `playable` says so.** `step` is
 * the game's step, not the seat's, so it reads `'place'` during an opponent's
 * placement; `playable` comes from the board alone. Without the explicit
 * `activeSeat === you` gate the rack would look live off-turn and dispatch a
 * `place-tile` the engine could only reject.
 *
 * **Hovering a tile shows where it goes on the board**, on any turn. Off-turn
 * the board marks nothing of yours, so this is how you find your tiles on it
 * while you plan. The disabled button still hears the pointer; it only refuses
 * the click.
 */
export function TileRack() {
  const view = useOwnView();
  const busy = useGameState((state) => state.inFlight != null);
  const client = useGameClient();
  const hint = useTutorialHint();
  const preview = useRackPreview();
  const hand = view?.handTiles;

  // A tile that leaves the hand (placed, or the screen handed to another seat
  // in hot-seat) takes its preview with it: the pointer may never leave a
  // button that has been swapped out from under it.
  useEffect(() => {
    if (preview && !hand?.some((t) => t.tile === preview)) setRackPreview(null);
  }, [hand, preview]);
  useEffect(() => () => setRackPreview(null), []);

  if (!view) return null;

  // A spectator's view carries no hand; so does a player whose bag has run dry.
  // Either way there is no rack to draw.
  if (view.handTiles.length === 0) return null;

  const yourTurn = view.activeSeat === view.you;

  return (
    <section className={styles.rack} aria-label={copy.game.yourTiles} data-idle={!yourTurn || undefined}>
      <div className={styles.rackTiles}>
        {view.handTiles.map(({ tile, effect, playable }) => (
          <button
            key={tile}
            type="button"
            className={styles.rackTile}
            data-effect={effect}
            data-hint={tile === hint || undefined}
            disabled={busy || !yourTurn || !playable || view.step !== 'place'}
            onClick={() => client.dispatch({ type: 'place-tile', seat: view.you, tile })}
            onPointerEnter={() => setRackPreview(tile)}
            onPointerLeave={() => setRackPreview(null)}
          >
            <span className={`tabnum ${styles.rackTileId}`}>{tile}</span>
            <span className={styles.rackTileEffect}>{EFFECT_LABEL[effect]}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
