import type { Layer, WhiteboardState } from '@caesar/shared';

// The board is held in memory and sent whole to every client that opens
// it. Per-layer limits (the router's schema) are not enough on their own:
// thousands of layers each at its limit would still be gigabytes. So the
// board has one budget, counted in stored values (a point coordinate or a
// character of text), checked on every add and update.
const MAX_LAYERS = 5_000;
const MAX_BOARD_WEIGHT = 2_000_000;

const weigh = (layer: Layer): number => {
  const points = 'points' in layer ? layer.points : undefined;
  const value = 'value' in layer ? layer.value : undefined;

  return (
    16 +
    (points?.reduce((sum, point) => sum + point.length, 0) ?? 0) +
    (value?.length ?? 0)
  );
};

// One server-wide board, opened from the activities menu. In memory only:
// like the watch party it resets on restart, nothing is written to the db.
class WhiteboardRuntime {
  private layers: Map<string, Layer> = new Map();
  private layerIds: string[] = [];
  private weight = 0;

  public getState(): WhiteboardState {
    const layers: Record<string, Layer> = {};
    for (const [id, layer] of this.layers) {
      layers[id] = layer;
    }
    return { layers, layerIds: [...this.layerIds] };
  }

  // stores `layer` under `id` unless it would take the board over budget
  private put(id: string, layer: Layer): boolean {
    const existing = this.layers.get(id);
    const weight =
      this.weight - (existing ? weigh(existing) : 0) + weigh(layer);

    if (weight > MAX_BOARD_WEIGHT) return false;
    if (!existing && this.layerIds.length >= MAX_LAYERS) return false;

    // a replayed/retried mutation reuses the layer id: pushing again would
    // render the layer once per duplicate and leave a dangling id behind
    // the first delete.
    if (!existing) this.layerIds.push(id);

    this.layers.set(id, layer);
    this.weight = weight;

    return true;
  }

  // false when the board is full (the layer is not added)
  public addLayer(id: string, layer: Layer): boolean {
    return this.put(id, layer);
  }

  // false when there is no such layer, or the change does not fit
  public updateLayer(id: string, partial: Partial<Layer>): boolean {
    const existing = this.layers.get(id);

    if (!existing) return false;

    return this.put(id, { ...existing, ...partial } as Layer);
  }

  public deleteLayer(ids: string[]): void {
    const deleted = new Set(ids);

    for (const id of deleted) {
      const layer = this.layers.get(id);

      if (!layer) continue;

      this.weight -= weigh(layer);
      this.layers.delete(id);
    }

    this.layerIds = this.layerIds.filter((id) => !deleted.has(id));
  }

  public clear(): void {
    this.layers.clear();
    this.layerIds = [];
    this.weight = 0;
  }
}

const whiteboard = new WhiteboardRuntime();

export { MAX_LAYERS, whiteboard, WhiteboardRuntime };
