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
import { getMySessionsRoute } from './get-my-sessions';
import { getMyVotesTodayRoute } from './get-my-votes-today';
import { getUserInfoRoute } from './get-user-info';
import { getUsersRoute } from './get-users';
import { kickRoute } from './kick';
import { meRoute } from './me';
import { onMyLoginRoute } from './on-my-login';
import { removeRoleRoute } from './remove-role';
import { renameIdentityRoute } from './rename-identity';
import { setAllowMultipleSessionsRoute } from './set-allow-multiple-sessions';
import { setAppearOfflineRoute } from './set-appear-offline';
import { signOutOtherSessionsRoute } from './sign-out-other-sessions';
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
  renameIdentity: renameIdentityRoute,
  setAppearOffline: setAppearOfflineRoute,
  setAllowMultipleSessions: setAllowMultipleSessionsRoute,
  signOutOtherSessions: signOutOtherSessionsRoute,
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
  getMySessions: getMySessionsRoute,
  onJoin: onUserJoinRoute,
  onLeave: onUserLeaveRoute,
  onUpdate: onUserUpdateRoute,
  onCreate: onUserCreateRoute,
  onDelete: onUserDeleteRoute,
  onMyLogin: onMyLoginRoute
});
