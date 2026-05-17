import { t } from '@server/utils/trpc';
import { getPublicKeyRoute } from './get-public';
import { registerKeyRoute } from './register';

export const keysRouter = t.router({
  register: registerKeyRoute,
  getPublic: getPublicKeyRoute
});
