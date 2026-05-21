import { t } from '@server/utils/trpc';
import { addInviteRoute } from './add-invite';
import { deleteInviteRoute } from './delete-invite';
import { getInvitesRoute } from './get-invites';
import { getLimitsRoute } from './get-limits';

export const invitesRouter = t.router({
  add: addInviteRoute,
  delete: deleteInviteRoute,
  getAll: getInvitesRoute,
  getLimits: getLimitsRoute
});
