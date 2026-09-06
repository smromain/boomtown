import ReactThreeTestRenderer from '@react-three/test-renderer';
import type { Mesh, MeshStandardMaterial } from 'three';
import { INDUSTRY_INFO, classic, createGame } from '@boomtown/engine';
import { clientView } from '@boomtown/client-core';
import { describe, expect, it, vi } from 'vitest';
import { BoardScene, type BoardSceneProps } from './BoardScene.js';

const base = clientView(createGame({ seats: [{ name: 'A' }, { name: 'B' }], seed: 1, turnOrder: [0, 1] }), 0);

function props(over: Partial<BoardSceneProps> = {}): BoardSceneProps {
  return {
    ruleset: classic,
    cells: {},
    corporations: base.corporations,
    playable: new Set(),
    onPick: vi.fn(),
    ...over,
  };
}

describe('BoardScene', () => {
  it('renders one grid instance per board cell', async () => {
    const renderer = await ReactThreeTestRenderer.create(<BoardScene {...props()} />);
    const cells = renderer.scene.findAll((node) => typeof node.props.name === 'string' && node.props.name.startsWith('cell:'));
    expect(cells).toHaveLength(108);
  });

  it('re-rendering from a new view keeps the grid instance count stable', async () => {
    const renderer = await ReactThreeTestRenderer.create(<BoardScene {...props()} />);
    await renderer.update(<BoardScene {...props({ cells: { '6E': { kind: 'unincorporated' } } })} />);
    const cells = renderer.scene.findAll((node) => typeof node.props.name === 'string' && node.props.name.startsWith('cell:'));
    expect(cells).toHaveLength(108);
  });

  it('clicking a playable cell calls onPick with that tile', async () => {
    const onPick = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <BoardScene {...props({ playable: new Set(['6E']), onPick })} />,
    );
    const cell = renderer.scene.find((node) => node.props.name === 'cell:6E');
    await renderer.fireEvent(cell, 'click');
    expect(onPick).toHaveBeenCalledWith('6E');
  });

  it('a placed corporation tile uses the industry colour', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <BoardScene {...props({ cells: { '6E': { kind: 'corporation', industry: 'video' } } })} />,
    );
    const tile = renderer.scene.find((node) => node.props.name === 'tile:6E');
    const material = (tile.instance as Mesh).material as MeshStandardMaterial;
    expect(`#${material.color.getHexString()}`).toBe(INDUSTRY_INFO.video.color.toLowerCase());
  });

  it('renders a headquarters marker for each founded corporation', async () => {
    const corporations = {
      ...base.corporations,
      video: { ...base.corporations.video, founded: true, hqTile: '5E' },
    };
    const renderer = await ReactThreeTestRenderer.create(<BoardScene {...props({ corporations })} />);
    expect(renderer.scene.find((node) => node.props.name === 'hq:video')).toBeTruthy();
  });
});
