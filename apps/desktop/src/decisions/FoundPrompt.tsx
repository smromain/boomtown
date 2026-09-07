import { INDUSTRIES, INDUSTRY_INFO, type Industry, type TileId } from '@boomtown/engine';
import { useGameClient, useLocalActiveView } from '../client/GameClientProvider.js';
import styles from './decisions.module.css';

/** After a founding placement: the founder picks which corporation to raise on the new group. */
export function FoundPrompt({ group }: { group: readonly TileId[] }) {
  const client = useGameClient();
  const view = useLocalActiveView();
  if (!view) return null;

  const available = INDUSTRIES.filter((industry) => !view.corporations[industry].founded);
  const hqTile = group[0]!;

  return (
    <div>
      <h2>Found a corporation</h2>
      <p className={styles.seat}>Seat {view.you} · new group of {group.length} tiles</p>
      <div className={styles.options}>
        {available.map((industry: Industry) => (
          <button
            key={industry}
            type="button"
            className={styles.option}
            style={{ borderColor: INDUSTRY_INFO[industry].color }}
            onClick={() => client.dispatch({ type: 'found-corporation', seat: view.you, industry, hqTile })}
          >
            {view.corporations[industry].baseName}
          </button>
        ))}
      </div>
    </div>
  );
}
