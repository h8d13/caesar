import { Permission } from '@caesar/shared';
import { getSettings } from '@server/db/queries/server';
import { protectedProcedure } from '@server/utils/trpc';

const getSettingsRoute = protectedProcedure.query(async ({ ctx }) => {
  await ctx.needsPermission(Permission.MANAGE_SETTINGS);

  const settings = await getSettings();

  // Never ship the server's internal HMAC key to a client. It signs nothing
  // anymore (sessions use the dedicated jwt.key) but still keys IP / file /
  // webauthn hashing and the owner-spawn check, so it stays server-only.
  const { secretToken: _secretToken, ...safeSettings } = settings;
  void _secretToken;

  return safeSettings;
});

export { getSettingsRoute };
