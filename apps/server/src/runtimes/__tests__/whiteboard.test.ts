import { LayerType, type Layer } from '@caesar/shared';
import { WhiteboardRuntime } from '@server/runtimes/whiteboard';
import { describe, expect, test } from 'vite-plus/test';

const createLayer = (x = 0): Layer => ({
  type: LayerType.Rectangle,
  x,
  y: 0,
  width: 10,
  height: 10,
  fill: { r: 0, g: 0, b: 0 }
});

// fresh runtime per case: the exported singleton is shared across test
// files (vitest runs with isolate: false).
describe('WhiteboardRuntime', () => {
  test('re-adding a layer id replaces it without duplicating the id', () => {
    const runtime = new WhiteboardRuntime();

    runtime.addLayer('a', createLayer(1));
    runtime.addLayer('a', createLayer(2));

    const state = runtime.getState();

    expect(state.layerIds).toEqual(['a']);
    expect(state.layers.a).toMatchObject({ x: 2 });
  });

  test('deleting a duplicate-added id leaves no dangling entry', () => {
    const runtime = new WhiteboardRuntime();

    runtime.addLayer('a', createLayer());
    runtime.addLayer('a', createLayer());
    runtime.addLayer('b', createLayer());
    runtime.deleteLayer(['a']);

    const state = runtime.getState();

    expect(state.layerIds).toEqual(['b']);
    expect(state.layers).not.toHaveProperty('a');
  });

  test('updating a missing layer is a no-op', () => {
    const runtime = new WhiteboardRuntime();

    runtime.updateLayer('ghost', { x: 5 });

    expect(runtime.getState()).toEqual({ layers: {}, layerIds: [] });
  });

  test('clear empties the board and drawing resumes after it', () => {
    const runtime = new WhiteboardRuntime();

    runtime.addLayer('a', createLayer());
    runtime.clear();
    expect(runtime.getState()).toEqual({ layers: {}, layerIds: [] });

    runtime.addLayer('b', createLayer());
    expect(runtime.getState().layerIds).toEqual(['b']);
  });
});
