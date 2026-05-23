import { t } from '@server/utils/trpc';
import { closeProducerRoute } from './close-producer';
import { connectConsumerTransportRoute } from './connect-consumer-transport';
import { connectProducerTransportRoute } from './connect-producer-transport';
import { consumeRoute } from './consume';
import { createConsumerTransportRoute } from './create-consumer-transport';
import { createProducerTransportRoute } from './create-producer-transport';
import {
  onSoundboardPlayRoute,
  onUserJoinVoiceRoute,
  onUserLeaveVoiceRoute,
  onUserUpdateVoiceStateRoute,
  onVoiceAddExternalStreamRoute,
  onVoiceChannelStateUpdateRoute,
  onVoiceNewProducerRoute,
  onVoiceProducerClosedRoute,
  onVoiceRemoveExternalStreamRoute,
  onVoiceUpdateExternalStreamRoute
} from './events';
import { getProducersRoute } from './get-producers';
import { joinVoiceRoute } from './join';
import { leaveVoiceRoute } from './leave';
import { pauseConsumerRoute } from './pause-consumer';
import { playSoundboardRoute } from './play-soundboard';
import { produceRoute } from './produce';
import { requestKeyFrameRoute } from './request-keyframe';
import { resumeConsumerRoute } from './resume-consumer';
import { setConsumerQualityRoute } from './set-consumer-quality';
import { updateVoiceStateRoute } from './update-state';

export const voiceRouter = t.router({
  join: joinVoiceRoute,
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
  onAddExternalStream: onVoiceAddExternalStreamRoute,
  onUpdateExternalStream: onVoiceUpdateExternalStreamRoute,
  onRemoveExternalStream: onVoiceRemoveExternalStreamRoute,
  pauseConsumer: pauseConsumerRoute,
  resumeConsumer: resumeConsumerRoute,
  setConsumerQuality: setConsumerQualityRoute,
  requestKeyFrame: requestKeyFrameRoute,
  playSoundboard: playSoundboardRoute,
  onSoundboardPlay: onSoundboardPlayRoute
});
