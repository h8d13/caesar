import { t } from '@server/utils/trpc';
import { createTempRoomRoute } from './create';
import { onTempRoomParticipantsRoute, onTempRoomsChangedRoute } from './events';
import { joinTempRoomRoute } from './join';
import { listTempRoomsRoute } from './list';
import { closeTempRoomRoute, kickTempRoomGuestRoute } from './manage';

export const tempRoomsRouter = t.router({
  create: createTempRoomRoute,
  list: listTempRoomsRoute,
  join: joinTempRoomRoute,
  close: closeTempRoomRoute,
  kickGuest: kickTempRoomGuestRoute,
  onParticipants: onTempRoomParticipantsRoute,
  onChanged: onTempRoomsChangedRoute
});
