import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GameOver } from './GameOver.js';
import { renderPanel, seedCorp } from '../testing/harness.js';

describe('GameOver', () => {
  it('renders nothing while the game is still playing', async () => {
    await renderPanel(<GameOver onLeave={undefined} />);
    expect(screen.queryByRole('dialog', { name: 'Game over' })).not.toBeInTheDocument();
  });

  it('shows the winner, who called it, and the full standings once over', async () => {
    await renderPanel(<GameOver onLeave={undefined} />, {
      craft: (state) => {
        // a minimal finished game: one safe corp, end announced, settled
        seedCorp(state, 'video', Array.from({ length: 11 }, (_, i) => `${i + 1}A`));
        state.status = 'over';
        state.endAnnouncedBy = 1;
        state.result = {
          rankings: [
            { seat: 2, cash: 7000, equity: 5000, total: 12000, holdings: [] },
            { seat: 0, cash: 6000, equity: 1000, total: 7000, holdings: [] },
            { seat: 1, cash: 5500, equity: 500, total: 6000, holdings: [] },
          ],
          winners: [2],
        };
      },
    });

    const dialog = screen.getByRole('dialog', { name: 'Game over' });
    expect(dialog).toHaveTextContent('Cy wins'); // harness seats are Ana/Ben/Cy
    expect(dialog).toHaveTextContent('Ben called the end.');
    const rows = within(dialog).getAllByRole('row');
    // header + 3 players
    expect(rows).toHaveLength(4);
    expect(rows[1]).toHaveTextContent('Cy');
    expect(rows[1]).toHaveTextContent('$12,000');
  });

  it('offers "New game" only when a leave handler is given', async () => {
    const onLeave = vi.fn();
    await renderPanel(<GameOver onLeave={onLeave} />, {
      craft: (state) => {
        state.status = 'over';
        state.result = { rankings: [{ seat: 0, cash: 6000, equity: 0, total: 6000, holdings: [] }], winners: [0] };
      },
    });
    const button = screen.getByRole('button', { name: 'New game' });
    button.click();
    expect(onLeave).toHaveBeenCalledOnce();
  });
});
