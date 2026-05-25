import type {
  Layer,
  ServerEvents,
  StreamKind,
  TCategory,
  TChannel,
  TChannelUserPermissionsMap,
  TExternalStream,
  TJoinedEmoji,
  TJoinedMessage,
  TJoinedPublicUser,
  TJoinedRole,
  TJoinedSound,
  TPublicServerSettings,
  TVoiceUserState,
  WhiteboardCursor
} from '@caesar/shared';
import type { Unsubscribable } from '@trpc/server/observable';
import { observable, type Observable } from '@trpc/server/observable';
import { EventEmitter } from 'events';

type Events = {
  [ServerEvents.NEW_MESSAGE]: TJoinedMessage;
  [ServerEvents.MESSAGE_UPDATE]: TJoinedMessage;
  [ServerEvents.MESSAGE_DELETE]: {
    messageId: number;
    channelId: number;
  };
  [ServerEvents.MESSAGE_TYPING]: {
    channelId: number;
    userId: number;
    parentMessageId?: number;
  };
  [ServerEvents.THREAD_REPLY_COUNT_UPDATE]: {
    messageId: number;
    channelId: number;
    replyCount: number;
  };

  [ServerEvents.USER_JOIN]: TJoinedPublicUser;
  [ServerEvents.USER_LEAVE]: number;
  [ServerEvents.USER_CREATE]: TJoinedPublicUser;
  [ServerEvents.USER_UPDATE]: TJoinedPublicUser;
  [ServerEvents.USER_DELETE]: {
    isWipe: boolean;
    userId: number;
    deletedUserId: number; // the special Deleted User placeholder
  };
  // self-only: published when a new logins row is inserted for a user.
  // payload is empty by design (the client re-fetches the hashed list via
  // users.getMySessions rather than receiving raw UA / ip over the wire).
  [ServerEvents.USER_LOGIN_RECORDED]: object;

  [ServerEvents.CHANNEL_CREATE]: TChannel;
  [ServerEvents.CHANNEL_UPDATE]: TChannel;
  [ServerEvents.CHANNEL_DELETE]: number;
  [ServerEvents.CHANNEL_PERMISSIONS_UPDATE]: TChannelUserPermissionsMap;
  [ServerEvents.CHANNEL_READ_STATES_UPDATE]: {
    channelId: number;
    count: number;
  };
  [ServerEvents.CHANNEL_READ_STATES_DELTA]: {
    channelId: number;
    delta: number;
  };

  [ServerEvents.USER_JOIN_VOICE]: {
    channelId: number;
    userId: number;
    state: TVoiceUserState;
  };
  [ServerEvents.USER_LEAVE_VOICE]: {
    channelId: number;
    userId: number;
  };
  [ServerEvents.VOICE_CHANNEL_STATE_UPDATE]: {
    channelId: number;
    activeSince: number | null;
  };
  [ServerEvents.VOICE_FORCE_MOVE]: {
    channelId: number;
  };
  [ServerEvents.USER_VOICE_STATE_UPDATE]: {
    channelId: number;
    userId: number;
    state: TVoiceUserState;
  };

  [ServerEvents.VOICE_NEW_PRODUCER]: {
    channelId: number;
    remoteId: number;
    kind: StreamKind;
  };
  [ServerEvents.VOICE_ADD_EXTERNAL_STREAM]: {
    channelId: number;
    streamId: number;
    stream: TExternalStream;
  };
  [ServerEvents.VOICE_UPDATE_EXTERNAL_STREAM]: {
    channelId: number;
    streamId: number;
    stream: TExternalStream;
  };
  [ServerEvents.VOICE_REMOVE_EXTERNAL_STREAM]: {
    channelId: number;
    streamId: number;
  };
  [ServerEvents.VOICE_PRODUCER_CLOSED]: {
    channelId: number;
    remoteId: number;
    kind: StreamKind;
  };

  [ServerEvents.EMOJI_CREATE]: TJoinedEmoji;
  [ServerEvents.EMOJI_UPDATE]: TJoinedEmoji;
  [ServerEvents.EMOJI_DELETE]: number;

  [ServerEvents.SOUND_CREATE]: TJoinedSound;
  [ServerEvents.SOUND_UPDATE]: TJoinedSound;
  [ServerEvents.SOUND_DELETE]: number;

  [ServerEvents.ROLE_CREATE]: TJoinedRole;
  [ServerEvents.ROLE_UPDATE]: TJoinedRole;
  [ServerEvents.ROLE_DELETE]: number;

  [ServerEvents.SERVER_SETTINGS_UPDATE]: TPublicServerSettings;

  [ServerEvents.CATEGORY_CREATE]: TCategory;
  [ServerEvents.CATEGORY_UPDATE]: TCategory;
  [ServerEvents.CATEGORY_DELETE]: number;

  [ServerEvents.CHANNEL_MENTION]: {
    channelId: number;
  };

  [ServerEvents.WHITEBOARD_LAYER_ADD]: {
    channelId: number;
    layerId: string;
    layer: Layer;
  };
  [ServerEvents.WHITEBOARD_LAYER_UPDATE]: {
    channelId: number;
    layerId: string;
    layer: Partial<Layer>;
  };
  [ServerEvents.WHITEBOARD_LAYER_DELETE]: {
    channelId: number;
    layerIds: string[];
  };
  [ServerEvents.WHITEBOARD_CURSOR_UPDATE]: {
    channelId: number;
    cursor: WhiteboardCursor;
  };
  [ServerEvents.WHITEBOARD_CLEAR]: {
    channelId: number;
  };

  [ServerEvents.DM_CONVERSATION_OPEN]: { channelId: number };
  [ServerEvents.DM_EPHEMERAL_UPDATE]: {
    channelId: number;
    ephemeralMs: number | null;
  };
  [ServerEvents.DM_WIPED]: { channelId: number };
  [ServerEvents.DM_CALL_RING]: {
    channelId: number;
    callerId: number;
  };
  [ServerEvents.DM_CALL_ACCEPTED]: { channelId: number };
  [ServerEvents.DM_CALL_ENDED]: { channelId: number };
  [ServerEvents.DM_READ]: {
    channelId: number;
    readerId: number;
    lastReadMessageId: number;
    readAt: number;
  };

  [ServerEvents.SOUNDBOARD_PLAY]: {
    channelId: number;
    soundId: number;
  };
};

class PubSub {
  private ee: EventEmitter;
  private userListeners: Map<
    number,
    Map<string, Set<(data: Events[keyof Events]) => void>>
  > = new Map();
  private channelListeners: Map<
    number,
    Map<string, Set<(data: Events[keyof Events]) => void>>
  > = new Map();
  // Topic-keyed listeners that receive every publishForChannel emission
  // regardless of channel. Used by subscribers that need to filter the
  // channel id dynamically per event (e.g. voice subscriptions that
  // outlive a single channelId snapshot).
  private anyChannelListeners: Map<
    string,
    Set<(data: Events[keyof Events]) => void>
  > = new Map();

  constructor() {
    this.ee = new EventEmitter();

    this.ee.setMaxListeners(50);
  }

  public publish<TTopic extends keyof Events>(
    topic: TTopic,
    payload: Events[TTopic]
  ): void {
    this.ee.emit(topic, payload);
  }

  public publishFor<TTopic extends keyof Events>(
    userIds: number | number[],
    topic: TTopic,
    payload: Events[TTopic]
  ): void {
    const targetUserIds = Array.isArray(userIds) ? userIds : [userIds];

    for (const userId of targetUserIds) {
      const userTopics = this.userListeners.get(userId);

      if (!userTopics) continue;

      const listeners = userTopics.get(topic);

      if (!listeners) continue;

      for (const listener of listeners) {
        listener(payload);
      }
    }
  }

  public subscribe<TTopic extends keyof Events>(
    topic: TTopic
  ): Observable<Events[TTopic], unknown> {
    return observable((observer) => {
      const listener = (data: Events[TTopic]) => {
        observer.next(data);
      };

      this.ee.on(topic, listener);

      const ee = this.ee;

      const unsubscribable: Unsubscribable = {
        unsubscribe() {
          ee.off(topic, listener);
        }
      };

      return unsubscribable;
    });
  }

  public subscribeFor<TTopic extends keyof Events>(
    userId: number,
    topic: TTopic
  ): Observable<Events[TTopic], unknown> {
    return observable((observer) => {
      const listener = (data: Events[TTopic]) => {
        observer.next(data);
      };

      if (!this.userListeners.has(userId)) {
        this.userListeners.set(userId, new Map());
      }

      const userTopics = this.userListeners.get(userId)!;

      if (!userTopics.has(topic)) {
        userTopics.set(topic, new Set());
      }

      userTopics
        .get(topic)!
        .add(listener as (data: Events[keyof Events]) => void);

      const unsubscribable: Unsubscribable = {
        unsubscribe: () => {
          const userTopics = this.userListeners.get(userId);

          if (!userTopics) return;

          const listeners = userTopics.get(topic);

          if (!listeners) return;

          listeners.delete(listener as (data: Events[keyof Events]) => void);

          if (listeners.size === 0) {
            userTopics.delete(topic);
          }

          if (userTopics.size === 0) {
            this.userListeners.delete(userId);
          }
        }
      };

      return unsubscribable;
    });
  }

  public publishForChannel<TTopic extends keyof Events>(
    channelId: number,
    topic: TTopic,
    payload: Events[TTopic]
  ): void {
    const channelTopics = this.channelListeners.get(channelId);

    if (channelTopics) {
      const listeners = channelTopics.get(topic);

      if (listeners) {
        for (const listener of listeners) {
          listener(payload);
        }
      }
    }

    const anyListeners = this.anyChannelListeners.get(topic);

    if (anyListeners) {
      for (const listener of anyListeners) {
        listener(payload);
      }
    }
  }

  // Subscribe to every publishForChannel emission for a topic across all
  // channels. Used when the consumer needs to filter the channel id per
  // event (e.g. ctx-driven voice subscriptions where ctx.currentVoiceChannelId
  // is set after the subscription itself was opened).
  public subscribeAcrossChannels<TTopic extends keyof Events>(
    topic: TTopic
  ): Observable<Events[TTopic], unknown> {
    return observable((observer) => {
      const listener = (data: Events[TTopic]) => {
        observer.next(data);
      };

      if (!this.anyChannelListeners.has(topic)) {
        this.anyChannelListeners.set(topic, new Set());
      }

      this.anyChannelListeners
        .get(topic)!
        .add(listener as (data: Events[keyof Events]) => void);

      const unsubscribable: Unsubscribable = {
        unsubscribe: () => {
          const listeners = this.anyChannelListeners.get(topic);

          if (!listeners) return;

          listeners.delete(listener as (data: Events[keyof Events]) => void);

          if (listeners.size === 0) {
            this.anyChannelListeners.delete(topic);
          }
        }
      };

      return unsubscribable;
    });
  }

  public subscribeForChannel<TTopic extends keyof Events>(
    channelId: number,
    topic: TTopic
  ): Observable<Events[TTopic], unknown> {
    return observable((observer) => {
      const listener = (data: Events[TTopic]) => {
        observer.next(data);
      };

      if (!this.channelListeners.has(channelId)) {
        this.channelListeners.set(channelId, new Map());
      }

      const channelTopics = this.channelListeners.get(channelId)!;

      if (!channelTopics.has(topic)) {
        channelTopics.set(topic, new Set());
      }

      channelTopics
        .get(topic)!
        .add(listener as (data: Events[keyof Events]) => void);

      const unsubscribable: Unsubscribable = {
        unsubscribe: () => {
          const channelTopics = this.channelListeners.get(channelId);

          if (!channelTopics) return;

          const listeners = channelTopics.get(topic);

          if (!listeners) return;

          listeners.delete(listener as (data: Events[keyof Events]) => void);

          if (listeners.size === 0) {
            channelTopics.delete(topic);
          }

          if (channelTopics.size === 0) {
            this.channelListeners.delete(channelId);
          }
        }
      };

      return unsubscribable;
    });
  }
}

export const pubsub = new PubSub();
