import { t } from '@server/utils/trpc';
import { addRoleRoute } from './add-role';
import { banRoute } from './ban';
import { changeAvatarRoute } from './change-avatar';
import { changeBannerRoute } from './change-banner';
import { deleteUserRoute } from './delete-user';
import {
  onUserCreateRoute,
  onUserDeleteRoute,
  onUserJoinRoute,
  onUserLeaveRoute,
  onUserUpdateRoute
} from './events';
import { getMyVotesTodayRoute } from './get-my-votes-today';
import { getUserInfoRoute } from './get-user-info';
import { getUsersRoute } from './get-users';
import { kickRoute } from './kick';
import { meRoute } from './me';
import { removeRoleRoute } from './remove-role';
import { setAppearOfflineRoute } from './set-appear-offline';
import { unbanRoute } from './unban';
import { updatePasswordRoute } from './update-password';
import { updateUserRoute } from './update-user';
import { voteSocialCreditRoute } from './vote-social-credit';

export const usersRouter = t.router({
  changeAvatar: changeAvatarRoute,
  changeBanner: changeBannerRoute,
  addRole: addRoleRoute,
  removeRole: removeRoleRoute,
  update: updateUserRoute,
  setAppearOffline: setAppearOfflineRoute,
  updatePassword: updatePasswordRoute,
  getInfo: getUserInfoRoute,
  getAll: getUsersRoute,
  me: meRoute,
  kick: kickRoute,
  ban: banRoute,
  unban: unbanRoute,
  delete: deleteUserRoute,
  voteSocialCredit: voteSocialCreditRoute,
  getMyVotesToday: getMyVotesTodayRoute,
  onJoin: onUserJoinRoute,
  onLeave: onUserLeaveRoute,
  onUpdate: onUserUpdateRoute,
  onCreate: onUserCreateRoute,
  onDelete: onUserDeleteRoute
});
