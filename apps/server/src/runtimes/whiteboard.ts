import type { Layer, WhiteboardState } from '@caesar/shared';

// One server-wide board, opened from the activities menu. In memory only:
// like the watch party it resets on restart, nothing is written to the db.
class WhiteboardRuntime {
  private layers: Map<string, Layer> = new Map();
  private layerIds: string[] = [];

  public getState(): WhiteboardState {
    const layers: Record<string, Layer> = {};
    for (const [id, layer] of this.layers) {
      layers[id] = layer;
    }
    return { layers, layerIds: [...this.layerIds] };
  }

  public addLayer(id: string, layer: Layer): void {
    // a replayed/retried mutation reuses the layer id: pushing again would
    // render the layer once per duplicate and leave a dangling id behind
    // the first delete.
    if (!this.layers.has(id)) this.layerIds.push(id);
    this.layers.set(id, layer);
  }

  public updateLayer(id: string, partial: Partial<Layer>): void {
    const existing = this.layers.get(id);
    if (!existing) return;
    this.layers.set(id, { ...existing, ...partial } as Layer);
  }

  public deleteLayer(ids: string[]): void {
    const deleted = new Set(ids);
    for (const id of deleted) {
      this.layers.delete(id);
    }
    this.layerIds = this.layerIds.filter((id) => !deleted.has(id));
  }

  public clear(): void {
    this.layers.clear();
    this.layerIds = [];
  }
}

const whiteboard = new WhiteboardRuntime();

export { whiteboard, WhiteboardRuntime };
