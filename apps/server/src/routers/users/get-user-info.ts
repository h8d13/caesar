import { Permission, type TLogin } from '@caesar/shared';
import z from 'zod';
import { getFilesByUserId } from '@server/db/queries/files';
import { getLastLogins } from '@server/db/queries/logins';
import { getNonDirectMessagesFromUserId } from '@server/db/queries/messages';
import { getUserById } from '@server/db/queries/users';
import { clearFields } from '@server/helpers/clear-fields';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';

const getUserInfoRoute = protectedProcedure
  .input(
    z.object({
      userId: z.number()
    })
  )
  .query(async ({ ctx, input }) => {
    await ctx.needsPermission(Permission.MANAGE_USERS);

    const user = await getUserById(input.userId);

    invariant(user, {
      code: 'NOT_FOUND',
      message: 'User not found'
    });

    const [logins, files, messages] = await Promise.all([
      getLastLogins(user.id, 6),
      getFilesByUserId(user.id),
      getNonDirectMessagesFromUserId(user.id)
    ]);

    let cleanUser = clearFields(user, ['password']);
    let cleanLogins: TLogin[] = [...logins];

    if (!(await ctx.hasPermission(Permission.VIEW_USER_SENSITIVE_DATA))) {
      // doesn't have permission to view sensitive data, remove identity and ip hash
      cleanUser = clearFields(cleanUser, ['identity']);
      cleanLogins = logins.map((login) => ({
        ...login,
        ip: null
      }));
    }

    return { user: cleanUser, logins: cleanLogins, files, messages };
  });

export { getUserInfoRoute };
