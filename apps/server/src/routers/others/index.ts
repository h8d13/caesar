import { t } from '../../utils/trpc';
import { changeLogoRoute } from './change-logo';
import { onServerSettingsUpdateRoute } from './events';
import { getBankBalanceRoute } from './get-bank-balance';
import { getSettingsRoute } from './get-settings';
import { getStorageSettingsRoute } from './get-storage-settings';
import { handshakeRoute } from './handshake';
import { joinServerRoute } from './join';
import { pingRoute } from './ping';
import { updateSettingsRoute } from './update-settings';
import { useSecretTokenRoute } from './use-secret-token';

export const othersRouter = t.router({
  joinServer: joinServerRoute,
  handshake: handshakeRoute,
  ping: pingRoute,
  updateSettings: updateSettingsRoute,
  changeLogo: changeLogoRoute,
  getSettings: getSettingsRoute,
  onServerSettingsUpdate: onServerSettingsUpdateRoute,
  useSecretToken: useSecretTokenRoute,
  getStorageSettings: getStorageSettingsRoute,
  getBankBalance: getBankBalanceRoute
});
