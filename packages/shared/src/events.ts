export enum ServerEvents {
  NEW_MESSAGE = 'newMessage',
  MESSAGE_UPDATE = 'messageUpdate',
  MESSAGE_DELETE = 'messageDelete',
  MESSAGE_TYPING = 'messageTyping',
  THREAD_REPLY_COUNT_UPDATE = 'threadReplyCountUpdate',

  USER_JOIN = 'userJoin',
  USER_LEAVE = 'userLeave',

  CHANNEL_CREATE = 'channelCreate',
  CHANNEL_UPDATE = 'channelUpdate',
  CHANNEL_DELETE = 'channelDelete',
  CHANNEL_PERMISSIONS_UPDATE = 'channelPermissionsUpdate',
  CHANNEL_READ_STATES_UPDATE = 'channelReadStatesUpdate',
  CHANNEL_READ_STATES_DELTA = 'channelReadStatesDelta',

  USER_JOIN_VOICE = 'userJoinVoice',
  USER_LEAVE_VOICE = 'userLeaveVoice',
  USER_VOICE_STATE_UPDATE = 'userVoiceStateUpdate',
  VOICE_CHANNEL_STATE_UPDATE = 'voiceChannelStateUpdate',
  // Targeted (publishFor): a moderator dragged this user to another voice
  // channel. The recipient's client re-runs its join flow for the new channel.
  VOICE_FORCE_MOVE = 'voiceForceMove',

  VOICE_ADD_EXTERNAL_STREAM = 'voiceAddExternalStream',
  VOICE_UPDATE_EXTERNAL_STREAM = 'voiceUpdateExternalStream',
  VOICE_REMOVE_EXTERNAL_STREAM = 'voiceRemoveExternalStream',
  VOICE_NEW_PRODUCER = 'voiceNewProducer',
  VOICE_PRODUCER_CLOSED = 'voiceProducerClosed',

  EMOJI_CREATE = 'emojiCreate',
  EMOJI_UPDATE = 'emojiUpdate',
  EMOJI_DELETE = 'emojiDelete',

  SOUND_CREATE = 'soundCreate',
  SOUND_UPDATE = 'soundUpdate',
  SOUND_DELETE = 'soundDelete',

  ROLE_CREATE = 'roleCreate',
  ROLE_UPDATE = 'roleUpdate',
  ROLE_DELETE = 'roleDelete',

  USER_CREATE = 'userCreate',
  USER_UPDATE = 'userUpdate',
  USER_DELETE = 'userDelete',

  SERVER_SETTINGS_UPDATE = 'serverSettingsUpdate',

  CATEGORY_CREATE = 'categoryCreate',
  CATEGORY_UPDATE = 'categoryUpdate',
  CATEGORY_DELETE = 'categoryDelete',

  CHANNEL_MENTION = 'channelMention',

  WHITEBOARD_LAYER_ADD = 'whiteboardLayerAdd',
  WHITEBOARD_LAYER_UPDATE = 'whiteboardLayerUpdate',
  WHITEBOARD_LAYER_DELETE = 'whiteboardLayerDelete',
  WHITEBOARD_CURSOR_UPDATE = 'whiteboardCursorUpdate',
  WHITEBOARD_CLEAR = 'whiteboardClear',

  USER_LOGIN_RECORDED = 'userLoginRecorded',

  DM_CONVERSATION_OPEN = 'dmConversationOpen',
  DM_EPHEMERAL_UPDATE = 'dmEphemeralUpdate',
  DM_WIPED = 'dmWiped',
  DM_CALL_RING = 'dmCallRing',
  DM_CALL_ACCEPTED = 'dmCallAccepted',
  DM_CALL_ENDED = 'dmCallEnded',
  DM_READ = 'dmRead',

  SOUNDBOARD_PLAY = 'soundboardPlay',

  WATCH_PARTY_UPDATE = 'watchPartyUpdate',
  PREDICTION_POOL_UPDATE = 'predictionPoolUpdate'
}

export type TNewMessage = {
  content: string;
  channelId: number;
};
