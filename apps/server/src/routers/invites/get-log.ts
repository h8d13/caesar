import { Permission } from '@caesar/shared';
import { getInviteLog, getInvites } from '@server/db/queries/invites';
import { getUnassignableRoleIds } from '@server/routers/users/assert-can-assign-role';
import { protectedProcedure } from '@server/utils/trpc';

// created / deleted / used, for tracing who came in through which code
const INVITE_LOG_LIMIT = 500;

const getInviteLogRoute = protectedProcedure.query(async ({ ctx }) => {
  await ctx.needsPermission(Permission.MANAGE_INVITES);

  const [log, invites] = await Promise.all([
    getInviteLog(INVITE_LOG_LIMIT),
    getInvites()
  ]);

  // same rule as invites.getAll: the log must not hand out the code of a
  // live role-carrying invite the viewer could not have created
  const unassignable = await getUnassignableRoleIds(
    ctx.userId,
    invites.map((invite) => invite.roleId)
  );
  const hiddenCodes = new Set(
    invites
      .filter((invite) => invite.roleId && unassignable.has(invite.roleId))
      .map((invite) => invite.code)
  );

  if (hiddenCodes.size === 0) return log;

  return log.map((entry) => {
    const details = entry.details as { code?: string } | null;

    return details?.code && hiddenCodes.has(details.code)
      ? { ...entry, details: { ...details, code: '' } }
      : entry;
  });
});

export { getInviteLogRoute };
