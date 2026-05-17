import { protectedProcedure } from '@server/utils/trpc';

// Returns the caller's own canonical identity. Used client-side to
// re-derive the E2EE keypair without prompting the user to re-enter
// their username (e.g. on the password prompt dialog after auto-login).
const meRoute = protectedProcedure.query(({ ctx }) => {
  return { identity: ctx.user.identity };
});

export { meRoute };
