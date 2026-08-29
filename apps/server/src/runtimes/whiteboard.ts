import type { Layer, WhiteboardState } from '@caesar/shared';

const whiteboardRuntimes = new Map<number, WhiteboardRuntime>();

class WhiteboardRuntime {
  public readonly channelId: number;
  private layers: Map<string, Layer> = new Map();
  private layerIds: string[] = [];

  constructor(channelId: number) {
    this.channelId = channelId;
    whiteboardRuntimes.set(channelId, this);
  }

  public static findById(channelId: number): WhiteboardRuntime | undefined {
    return whiteboardRuntimes.get(channelId);
  }

  public static findOrCreate(channelId: number): WhiteboardRuntime {
    const existing = whiteboardRuntimes.get(channelId);
    if (existing) return existing;
    return new WhiteboardRuntime(channelId);
  }

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
    this.reclaimIfEmpty();
  }

  public clear(): void {
    this.layers.clear();
    this.layerIds = [];
    this.reclaimIfEmpty();
  }

  // nothing reads a layerless runtime: getState answers empty for an
  // unknown channel and addLayer recreates on demand. dropping it keeps
  // the map from retaining one entry per channel ever drawn on. runtimes
  // that still hold layers live until the process exits: board state is
  // in-memory only, nothing is written to the db.
  private reclaimIfEmpty(): void {
    if (this.layers.size > 0) return;
    whiteboardRuntimes.delete(this.channelId);
  }
}

export { WhiteboardRuntime };
