import { coinflipRouter } from '../games/coinflip/router';
import { crashRouter } from '../games/crash/router';
import { rouletteRouter } from '../games/roulette/router';
import { t } from '../utils/trpc';
import { categoriesRouter } from './categories';
import { channelsRouter } from './channels';
import { dmsRouter } from './dms';
import { emojisRouter } from './emojis';
import { filesRouter } from './files';
import { invitesRouter } from './invites';
import { keysRouter } from './keys';
import { messagesRouter } from './messages';
import { othersRouter } from './others';
import { rolesRouter } from './roles';
import { soundsRouter } from './sounds';
import { usersRouter } from './users';
import { voiceRouter } from './voice';
import { whiteboardRouter } from './whiteboard';

const appRouter = t.router({
  others: othersRouter,
  messages: messagesRouter,
  users: usersRouter,
  channels: channelsRouter,
  dms: dmsRouter,
  files: filesRouter,
  emojis: emojisRouter,
  sounds: soundsRouter,
  roles: rolesRouter,
  invites: invitesRouter,
  keys: keysRouter,
  voice: voiceRouter,
  categories: categoriesRouter,
  whiteboard: whiteboardRouter,
  crash: crashRouter,
  roulette: rouletteRouter,
  coinflip: coinflipRouter
});

type AppRouter = typeof appRouter;

export { appRouter };
export type { AppRouter };
