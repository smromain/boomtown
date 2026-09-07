import ReactThreeTestRenderer from '@react-three/test-renderer';
import type { Mesh, MeshStandardMaterial } from 'three';
import { INDUSTRY_INFO, classic, createGame } from '@boomtown/engine';
import { clientView } from '@boomtown/client-core';
import { describe, expect, it, vi } from 'vitest';
import { BoardScene, type BoardSceneProps } from './BoardScene.js';

// troika's <Text> needs a browser font pipeline; stub it to a named object (vi.mock is hoisted above the import).
vi.mock('@react-three/drei', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@react-three/drei')>();
  return {
    ...actual,
    Text: ({ name, children }: { name?: string; children?: unknown }) => (
      <group name={name ?? ''} userData={{ text: String(children ?? '') }} />
    ),
  };
});

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

const named = (renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>, prefix: string) =>
  renderer.scene.findAll(
    (node) => typeof node.props.name === 'string' && node.props.name.startsWith(prefix),
  );

describe('BoardScene', () => {
  it('covers every board cell, and labels each with its coordinate', async () => {
    const renderer = await ReactThreeTestRenderer.create(<BoardScene {...props()} />);
    expect(named(renderer, 'cell:')).toHaveLength(108);
    expect(named(renderer, 'label:')).toHaveLength(108);
  });

  it('renders the perimeter coordinate headers', async () => {
    const renderer = await ReactThreeTestRenderer.create(<BoardScene {...props()} />);
    expect(named(renderer, 'header-col:')).toHaveLength(12);
    expect(named(renderer, 'header-row:')).toHaveLength(9);
  });

  it('re-rendering from a new view keeps the cell count stable', async () => {
    const renderer = await ReactThreeTestRenderer.create(<BoardScene {...props()} />);
    await renderer.update(<BoardScene {...props({ cells: { '6E': { kind: 'unincorporated' } } })} />);
    expect(named(renderer, 'cell:')).toHaveLength(108);
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

  it('a placed corporation cell uses the industry colour', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <BoardScene {...props({ cells: { '6E': { kind: 'corporation', industry: 'video' } } })} />,
    );
    const cell = renderer.scene.find((node) => node.props.name === 'cell:6E');
    expect(cell.props.color).toBe(INDUSTRY_INFO.video.color);
  });

  it('a playable cell pulses — its colour changes over frames (the blink)', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <BoardScene {...props({ playable: new Set(['6E']) })} />,
    );
    const cell = renderer.scene.find((node) => node.props.name === 'cell:6E');
    const material = (cell.instance as Mesh).material as MeshStandardMaterial;
    const before = material.color.getHexString();
    await renderer.advanceFrames(20, 1 / 30);
    expect(material.color.getHexString()).not.toBe(before);
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
