import { Permission } from '@caesar/shared';
import { getEmojis } from '@server/db/queries/emojis';
import { protectedProcedure } from '@server/utils/trpc';

const getEmojisRoute = protectedProcedure.query(async ({ ctx }) => {
  await ctx.needsPermission(Permission.MANAGE_EMOJIS);

  const emojis = await getEmojis();

  return emojis;
});

export { getEmojisRoute };
