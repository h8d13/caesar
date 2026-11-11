import { LayerType, ServerEvents, type Layer } from '@caesar/shared';
import { MAX_LAYERS, whiteboard } from '@server/runtimes/whiteboard';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure, t } from '@server/utils/trpc';
import { z } from 'zod';

// Every layer is broadcast to every client and kept in server memory, so
// each field is bounded here; the board as a whole is bounded in the
// runtime (runtimes/whiteboard.ts).
const MAX_POINTS = 20_000; // a long freehand stroke; [x, y, pressure] each
const MAX_TEXT_LENGTH = 10_000;

const coordinate = z.number().finite();
const channel = z.number().min(0).max(255);
const layerIdSchema = z.string().min(1).max(64);

const colorSchema = z.object({
  r: channel,
  g: channel,
  b: channel
});

const layerSchema = z.object({
  type: z.enum(LayerType),
  x: coordinate,
  y: coordinate,
  width: coordinate,
  height: coordinate,
  fill: colorSchema,
  points: z.array(z.array(coordinate).max(3)).max(MAX_POINTS).optional(),
  value: z.string().max(MAX_TEXT_LENGTH).optional(),
  strokeSize: coordinate.optional(),
  x2: coordinate.optional(),
  y2: coordinate.optional()
});

// --- Queries ---

const getStateRoute = protectedProcedure.query(() => whiteboard.getState());

// --- Mutations ---

const addLayerRoute = protectedProcedure
  .input(
    z.object({
      layerId: layerIdSchema,
      layer: layerSchema
    })
  )
  .mutation(({ input, ctx }) => {
    const layer = input.layer as Layer;

    invariant(whiteboard.addLayer(input.layerId, layer), {
      code: 'BAD_REQUEST',
      message: 'The whiteboard is full. Clear it or remove some layers.'
    });

    ctx.pubsub.publish(ServerEvents.WHITEBOARD_LAYER_ADD, {
      layerId: input.layerId,
      layer
    });
  });

const updateLayerRoute = protectedProcedure
  .input(
    z.object({
      layerId: layerIdSchema,
      layer: layerSchema.partial()
    })
  )
  .mutation(({ input, ctx }) => {
    const layer = input.layer as Partial<Layer>;

    // nothing to tell anyone about a layer that does not exist or a change
    // that did not fit
    if (!whiteboard.updateLayer(input.layerId, layer)) return;

    ctx.pubsub.publish(ServerEvents.WHITEBOARD_LAYER_UPDATE, {
      layerId: input.layerId,
      layer
    });
  });

const deleteLayerRoute = protectedProcedure
  .input(z.object({ layerIds: z.array(layerIdSchema).max(MAX_LAYERS) }))
  .mutation(({ input, ctx }) => {
    whiteboard.deleteLayer(input.layerIds);

    ctx.pubsub.publish(ServerEvents.WHITEBOARD_LAYER_DELETE, {
      layerIds: input.layerIds
    });
  });

const clearRoute = protectedProcedure.mutation(({ ctx }) => {
  whiteboard.clear();

  ctx.pubsub.publish(ServerEvents.WHITEBOARD_CLEAR, {});
});

const cursorUpdateRoute = protectedProcedure
  .input(
    z.object({
      x: coordinate,
      y: coordinate
    })
  )
  .mutation(({ input, ctx }) => {
    ctx.pubsub.publish(ServerEvents.WHITEBOARD_CURSOR_UPDATE, {
      cursor: {
        userId: ctx.userId,
        userName: ctx.user.name,
        x: input.x,
        y: input.y
      }
    });
  });

// --- Subscriptions ---
// Global publish/subscribe pairs: the board is server-wide, so every
// connected client listens regardless of channel.

const onLayerAddRoute = protectedProcedure.subscription(({ ctx }) => {
  return ctx.pubsub.subscribe(ServerEvents.WHITEBOARD_LAYER_ADD);
});

const onLayerUpdateRoute = protectedProcedure.subscription(({ ctx }) => {
  return ctx.pubsub.subscribe(ServerEvents.WHITEBOARD_LAYER_UPDATE);
});

const onLayerDeleteRoute = protectedProcedure.subscription(({ ctx }) => {
  return ctx.pubsub.subscribe(ServerEvents.WHITEBOARD_LAYER_DELETE);
});

const onCursorUpdateRoute = protectedProcedure.subscription(({ ctx }) => {
  return ctx.pubsub.subscribe(ServerEvents.WHITEBOARD_CURSOR_UPDATE);
});

const onClearRoute = protectedProcedure.subscription(({ ctx }) => {
  return ctx.pubsub.subscribe(ServerEvents.WHITEBOARD_CLEAR);
});

export const whiteboardRouter = t.router({
  getState: getStateRoute,
  addLayer: addLayerRoute,
  updateLayer: updateLayerRoute,
  deleteLayer: deleteLayerRoute,
  clear: clearRoute,
  cursorUpdate: cursorUpdateRoute,
  onLayerAdd: onLayerAddRoute,
  onLayerUpdate: onLayerUpdateRoute,
  onLayerDelete: onLayerDeleteRoute,
  onCursorUpdate: onCursorUpdateRoute,
  onClear: onClearRoute
});
