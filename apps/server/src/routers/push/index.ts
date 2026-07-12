import { t } from '@server/utils/trpc';
import { subscribeRoute } from './subscribe';
import { unsubscribeRoute } from './unsubscribe';

export const pushRouter = t.router({
  subscribe: subscribeRoute,
  unsubscribe: unsubscribeRoute
});
