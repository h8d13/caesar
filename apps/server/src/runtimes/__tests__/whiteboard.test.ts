import { LayerType, type Layer } from '@caesar/shared';
import { WhiteboardRuntime } from '@server/runtimes/whiteboard';
import { describe, expect, test } from 'vitest';

const createLayer = (x = 0): Layer => ({
  type: LayerType.Rectangle,
  x,
  y: 0,
  width: 10,
  height: 10,
  fill: { r: 0, g: 0, b: 0 }
});

// module-level runtime map is shared across test files (vitest runs with
// isolate: false), so every case claims its own channel id.
let nextChannelId = 90_000;
const claimChannelId = (): number => nextChannelId++;

describe('WhiteboardRuntime', () => {
  test('re-adding a layer id replaces it without duplicating the id', () => {
    const channelId = claimChannelId();
    const runtime = WhiteboardRuntime.findOrCreate(channelId);

    runtime.addLayer('a', createLayer(1));
    runtime.addLayer('a', createLayer(2));

    const state = runtime.getState();

    expect(state.layerIds).toEqual(['a']);
    expect(state.layers.a).toMatchObject({ x: 2 });
  });

  test('deleting a duplicate-added id leaves no dangling entry', () => {
    const channelId = claimChannelId();
    const runtime = WhiteboardRuntime.findOrCreate(channelId);

    runtime.addLayer('a', createLayer());
    runtime.addLayer('a', createLayer());
    runtime.addLayer('b', createLayer());
    runtime.deleteLayer(['a']);

    const state = runtime.getState();

    expect(state.layerIds).toEqual(['b']);
    expect(state.layers).not.toHaveProperty('a');
  });

  test('runtime is reclaimed once its last layer is deleted', () => {
    const channelId = claimChannelId();
    const runtime = WhiteboardRuntime.findOrCreate(channelId);

    runtime.addLayer('a', createLayer());
    runtime.addLayer('b', createLayer());

    runtime.deleteLayer(['a']);
    expect(WhiteboardRuntime.findById(channelId)).toBe(runtime);

    runtime.deleteLayer(['b']);
    expect(WhiteboardRuntime.findById(channelId)).toBeUndefined();
  });

  test('clear reclaims the runtime', () => {
    const channelId = claimChannelId();
    const runtime = WhiteboardRuntime.findOrCreate(channelId);

    runtime.addLayer('a', createLayer());
    runtime.clear();

    expect(WhiteboardRuntime.findById(channelId)).toBeUndefined();
  });

  test('drawing again after a reclaim starts from a clean runtime', () => {
    const channelId = claimChannelId();
    const first = WhiteboardRuntime.findOrCreate(channelId);

    first.addLayer('a', createLayer());
    first.clear();

    const second = WhiteboardRuntime.findOrCreate(channelId);
    second.addLayer('b', createLayer());

    expect(second).not.toBe(first);
    expect(second.getState().layerIds).toEqual(['b']);
  });

  test('an empty runtime is reclaimed before it can be looked up twice', () => {
    const channelId = claimChannelId();

    WhiteboardRuntime.findOrCreate(channelId).clear();

    expect(WhiteboardRuntime.findById(channelId)).toBeUndefined();
  });
});
