import { t } from '../utils/trpc';
import { onTempRoomParticipantsRoute } from './temp-rooms/events';
import { joinTempRoomAsGuestRoute } from './temp-rooms/join-as-guest';
import { closeProducerRoute } from './voice/close-producer';
import { connectConsumerTransportRoute } from './voice/connect-consumer-transport';
import { connectProducerTransportRoute } from './voice/connect-producer-transport';
import { consumeRoute } from './voice/consume';
import { createConsumerTransportRoute } from './voice/create-consumer-transport';
import { createProducerTransportRoute } from './voice/create-producer-transport';
import {
  onUserJoinVoiceRoute,
  onUserLeaveVoiceRoute,
  onUserUpdateVoiceStateRoute,
  onVoiceChannelStateUpdateRoute,
  onVoiceNewProducerRoute,
  onVoiceProducerClosedRoute
} from './voice/events';
import { getProducersRoute } from './voice/get-producers';
import { leaveVoiceRoute } from './voice/leave';
import { pauseConsumerRoute } from './voice/pause-consumer';
import { produceRoute } from './voice/produce';
import { requestKeyFrameRoute } from './voice/request-keyframe';
import { resumeConsumerRoute } from './voice/resume-consumer';
import { setConsumerQualityRoute } from './voice/set-consumer-quality';
import { updateVoiceStateRoute } from './voice/update-state';

// Everything a guest socket can call. This list is the security boundary:
// a procedure that is not here does not exist for a guest, whatever its own
// checks are. Add to it only what a stranger holding a room link should
// reach. The names mirror appRouter so the client's voice code runs on
// either socket unchanged.
//
// Each voice procedure here is scoped by ctx.currentVoiceChannelId, which a
// guest can only ever have set to the room whose token they presented
// (join-as-guest), and every event is filtered by membership of that room.
const guestRouter = t.router({
  tempRooms: t.router({
    joinAsGuest: joinTempRoomAsGuestRoute,
    onParticipants: onTempRoomParticipantsRoute
  }),
  voice: t.router({
    leave: leaveVoiceRoute,
    updateState: updateVoiceStateRoute,
    createProducerTransport: createProducerTransportRoute,
    connectProducerTransport: connectProducerTransportRoute,
    createConsumerTransport: createConsumerTransportRoute,
    connectConsumerTransport: connectConsumerTransportRoute,
    closeProducer: closeProducerRoute,
    produce: produceRoute,
    consume: consumeRoute,
    getProducers: getProducersRoute,
    onJoin: onUserJoinVoiceRoute,
    onLeave: onUserLeaveVoiceRoute,
    onUpdateState: onUserUpdateVoiceStateRoute,
    onChannelState: onVoiceChannelStateUpdateRoute,
    onNewProducer: onVoiceNewProducerRoute,
    onProducerClosed: onVoiceProducerClosedRoute,
    pauseConsumer: pauseConsumerRoute,
    resumeConsumer: resumeConsumerRoute,
    setConsumerQuality: setConsumerQualityRoute,
    requestKeyFrame: requestKeyFrameRoute
  })
});

type GuestRouter = typeof guestRouter;

export { guestRouter };
export type { GuestRouter };
