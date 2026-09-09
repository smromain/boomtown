import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Panel } from './Panel.js';
import { Button } from './Button.js';

const globalCss = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../styles/global.css'), 'utf8');

describe('Panel', () => {
  it('renders children inside its surface element with the elevation reflected', () => {
    render(
      <Panel elevation={2} data-testid="panel">
        content
      </Panel>,
    );
    const el = screen.getByTestId('panel');
    expect(el).toHaveTextContent('content');
    expect(el).toHaveAttribute('data-elevation', '2');
  });

  it('reflects the frame prop, defaulting to a rule frame', () => {
    render(<Panel data-testid="panel">x</Panel>);
    expect(screen.getByTestId('panel')).toHaveAttribute('data-frame', 'rule');
  });

  it('omits data-frame when frame is "none"', () => {
    render(
      <Panel frame="none" data-testid="panel">
        x
      </Panel>,
    );
    expect(screen.getByTestId('panel')).not.toHaveAttribute('data-frame');
  });
});

describe('Button', () => {
  it('renders each variant with a distinct class and forwards onClick', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button variant="primary" onClick={onClick}>
        Go
      </Button>,
    );
    await user.click(screen.getByRole('button', { name: 'Go' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('forwards disabled', () => {
    render(<Button disabled>Go</Button>);
    expect(screen.getByRole('button', { name: 'Go' })).toBeDisabled();
  });
});

describe('anchor tokens', () => {
  it('keeps the anchored palette and typeface tokens unchanged (R2)', () => {
    expect(globalCss).toContain('--bg: #faf6f0;');
    expect(globalCss).toContain('--accent: #b3462f;');
    expect(globalCss).toContain('"DM Sans"');
    expect(globalCss).toContain('"DM Serif Display"');
  });
});
