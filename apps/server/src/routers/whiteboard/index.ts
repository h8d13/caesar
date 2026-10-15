import { ServerEvents, type Layer } from '@caesar/shared';
import { whiteboard } from '@server/runtimes/whiteboard';
import { protectedProcedure, t } from '@server/utils/trpc';
import { z } from 'zod';

const colorSchema = z.object({
  r: z.number(),
  g: z.number(),
  b: z.number()
});

const layerSchema = z.object({
  type: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  fill: colorSchema,
  points: z.array(z.array(z.number())).optional(),
  value: z.string().optional(),
  strokeSize: z.number().optional(),
  x2: z.number().optional(),
  y2: z.number().optional()
});

// --- Queries ---

const getStateRoute = protectedProcedure.query(() => whiteboard.getState());

// --- Mutations ---

const addLayerRoute = protectedProcedure
  .input(
    z.object({
      layerId: z.string(),
      layer: layerSchema
    })
  )
  .mutation(({ input, ctx }) => {
    const layer = input.layer as Layer;
    whiteboard.addLayer(input.layerId, layer);

    ctx.pubsub.publish(ServerEvents.WHITEBOARD_LAYER_ADD, {
      layerId: input.layerId,
      layer
    });
  });

const updateLayerRoute = protectedProcedure
  .input(
    z.object({
      layerId: z.string(),
      layer: layerSchema.partial()
    })
  )
  .mutation(({ input, ctx }) => {
    const layer = input.layer as Partial<Layer>;
    whiteboard.updateLayer(input.layerId, layer);

    ctx.pubsub.publish(ServerEvents.WHITEBOARD_LAYER_UPDATE, {
      layerId: input.layerId,
      layer
    });
  });

const deleteLayerRoute = protectedProcedure
  .input(z.object({ layerIds: z.array(z.string()) }))
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
      x: z.number(),
      y: z.number()
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
