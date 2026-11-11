import { LayerType } from '@caesar/shared';
import { initTest } from '@server/__tests__/helpers';
import { describe, expect, test } from 'vite-plus/test';

const layer = {
  type: LayerType.Note,
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  fill: { r: 0, g: 0, b: 0 }
};

// the board is held in server memory and broadcast whole, so its inputs
// have to be bounded
describe('whiteboard router', () => {
  test('should add a layer within bounds', async () => {
    const { caller } = await initTest(2);

    await caller.whiteboard.addLayer({ layerId: 'ok', layer });

    expect((await caller.whiteboard.getState()).layerIds).toContain('ok');

    await caller.whiteboard.clear();
  });

  test('should reject oversized text', async () => {
    const { caller } = await initTest(2);

    await expect(
      caller.whiteboard.addLayer({
        layerId: 'a',
        layer: { ...layer, value: 'x'.repeat(10_001) }
      })
    ).rejects.toThrow();
  });

  test('should reject an oversized path', async () => {
    const { caller } = await initTest(2);

    await expect(
      caller.whiteboard.addLayer({
        layerId: 'a',
        layer: {
          ...layer,
          type: LayerType.Path,
          points: Array.from({ length: 20_001 }, () => [0, 0])
        }
      })
    ).rejects.toThrow();
  });

  test('should reject an oversized layer id and an unknown type', async () => {
    const { caller } = await initTest(2);

    await expect(
      caller.whiteboard.addLayer({ layerId: 'x'.repeat(65), layer })
    ).rejects.toThrow();
    await expect(
      caller.whiteboard.addLayer({
        layerId: 'a',
        layer: { ...layer, type: 'bogus' as never }
      })
    ).rejects.toThrow();
  });
});
