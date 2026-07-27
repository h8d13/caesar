import {
  ServerEvents,
  StreamKind,
  type TChannelState,
  type TExternalStreamsMap,
  type TPublicVoiceChannelState,
  type TRemoteProducerIds,
  type TStreamQualityLayer,
  type TTransportParams,
  type TVoiceMap,
  type TVoiceUserState
} from '@caesar/shared';
import type {
  AppData,
  Consumer,
  Producer,
  Router,
  RouterOptions,
  WebRtcTransport
} from 'mediasoup/types';
import { config } from '../config';
import { logger } from '../logger';
import {
  getAllWorkers,
  getListenInfo,
  getWorkerSlot
} from '../utils/mediasoup';
import { pubsub } from '../utils/pubsub';

const voiceRuntimes = new Map<number, VoiceRuntime>();

const defaultRouterOptions: RouterOptions<AppData> = {
  mediaCodecs: [
    {
      kind: 'video',
      mimeType: 'video/VP9',
      clockRate: 90000,
      parameters: {
        'x-google-start-bitrate': 2000
      }
    },
    {
      kind: 'video',
      mimeType: 'video/VP8',
      clockRate: 90000,
      parameters: {
        'x-google-start-bitrate': 2000
      }
    },
    {
      kind: 'video',
      mimeType: 'video/H264',
      clockRate: 90000,
      parameters: {
        'packetization-mode': 1,
        'profile-level-id': '42e01f',
        'level-asymmetry-allowed': 1,
        'x-google-start-bitrate': 2000
      }
    },
    {
      kind: 'video',
      mimeType: 'video/H264',
      clockRate: 90000,
      parameters: {
        'packetization-mode': 1,
        'profile-level-id': '640032',
        'level-asymmetry-allowed': 1,
        'x-google-start-bitrate': 2000
      }
    },
    {
      kind: 'video',
      mimeType: 'video/AV1',
      clockRate: 90000,
      parameters: {
        'x-google-start-bitrate': 2000
      }
    },
    {
      kind: 'audio',
      mimeType: 'audio/opus',
      clockRate: 48000,
      channels: 2,
      parameters: {
        useinbandfec: 1,
        usedtx: 0,
        stereo: 1,
        'sprop-stereo': 1,
        maxplaybackrate: 48000,
        maxaveragebitrate: 128000
      }
    }
  ]
};

const defaultUserState: TVoiceUserState = {
  micMuted: false,
  soundMuted: false,
  webcamEnabled: false,
  sharingScreen: false
};

type TTransportMap = {
  [userId: number]: WebRtcTransport<AppData>;
};

type TProducerMap = {
  [userId: number]: Producer<AppData>;
};

type TConsumerMap = {
  [userId: number]: {
    [key: string]: Consumer<AppData>;
  };
};

type TExternalStreamProducers = {
  audioProducer?: Producer<AppData>;
  videoProducer?: Producer<AppData>;
};

type TExternalStreamInternal = {
  title: string;
  key: string;
  sourceId: string;
  avatarUrl?: string;
  producers: TExternalStreamProducers;
};

class VoiceRuntime {
  public readonly id: number;
  private state: TChannelState = {
    users: [],
    externalStreams: {},
    activeSince: null
  };
  // one router per worker slot, keyed by worker index
  private routers: Map<number, Router<AppData>> = new Map();
  // per-user assignment to a worker (round-robin within this channel)
  private userWorkerIndex: Map<number, number> = new Map();
  // producers piped to non-owner routers: producerId -> set of dest worker idx
  private pipedProducers: Map<string, Set<number>> = new Map();
  // in-flight pipe ops keyed by `${producerId}-${destWorkerIndex}` so
  // concurrent consumes of the same producer share one pipeToRouter call
  // instead of racing into a duplicate (the duplicate reuses the producer id
  // on the dest router and throws, dropping that listener's consumer).
  private pipePromises: Map<string, Promise<void>> = new Map();
  private rrCursor = 0;
  private consumerTransports: TTransportMap = {};
  private producerTransports: TTransportMap = {};
  private videoProducers: TProducerMap = {};
  private audioProducers: TProducerMap = {};
  private screenProducers: TProducerMap = {};
  private screenAudioProducers: TProducerMap = {};
  private consumers: TConsumerMap = {};
  // producerId -> simulcast quality layers metadata (labels match producer encodings)
  private producerQualityLayers: Map<string, TStreamQualityLayer[]> = new Map();

  private externalCounter = 0;
  private externalStreamsInternal: {
    [streamId: number]: TExternalStreamInternal;
  } = {};

  constructor(channelId: number) {
    this.id = channelId;
    voiceRuntimes.set(channelId, this);
  }

  public static findById = (channelId: number): VoiceRuntime | undefined => {
    return voiceRuntimes.get(channelId);
  };

  public static findRuntimeByUserId = (
    userId: number
  ): VoiceRuntime | undefined => {
    for (const runtime of voiceRuntimes.values()) {
      if (runtime.getUser(userId)) {
        return runtime;
      }
    }

    return undefined;
  };

  public static getVoiceMap = (): TVoiceMap => {
    const map: TVoiceMap = {};

    voiceRuntimes.forEach((runtime, channelId) => {
      const state = runtime.getState();
      const users: TPublicVoiceChannelState['users'] = {};

      state.users.forEach((user) => {
        users[user.userId] = user.state;
      });

      map[channelId] = {
        users,
        activeSince: state.activeSince
      };
    });

    return map;
  };

  public static getExternalStreamsMap = (): TExternalStreamsMap => {
    const map: TExternalStreamsMap = {};

    voiceRuntimes.forEach((runtime, channelId) => {
      if (map[channelId]) {
        map[channelId] = [];
      }

      map[channelId] = runtime.getState().externalStreams;
    });

    return map;
  };

  public init = async (): Promise<void> => {
    logger.debug(`Initializing voice runtime for channel ${this.id}`);

    await this.createRouters();
  };

  public destroy = async () => {
    for (const router of this.routers.values()) {
      await router.close();
    }
    this.routers.clear();
    this.pipedProducers.clear();
    this.userWorkerIndex.clear();

    Object.values(this.consumerTransports).forEach((transport) => {
      transport.close();
    });

    Object.values(this.producerTransports).forEach((transport) => {
      transport.close();
    });

    Object.values(this.videoProducers).forEach((producer) => {
      producer.close();
    });

    Object.values(this.screenProducers).forEach((producer) => {
      producer.close();
    });

    Object.values(this.screenAudioProducers).forEach((producer) => {
      producer.close();
    });

    Object.values(this.audioProducers).forEach((producer) => {
      producer.close();
    });

    Object.values(this.externalStreamsInternal).forEach((stream) => {
      if (
        stream.producers.videoProducer &&
        !stream.producers.videoProducer.closed
      ) {
        stream.producers.videoProducer.close();
      }
      if (
        stream.producers.audioProducer &&
        !stream.producers.audioProducer.closed
      ) {
        stream.producers.audioProducer.close();
      }
    });

    Object.values(this.consumers).forEach((consumers) => {
      Object.values(consumers).forEach((consumer) => {
        consumer.close();
      });
    });

    voiceRuntimes.delete(this.id);
  };

  public getState = (): TChannelState => {
    return this.state;
  };

  public getUser = (userId: number) => {
    return this.state.users.find((u) => u.userId === userId);
  };

  public getUserState = (userId: number): TVoiceUserState => {
    const user = this.getUser(userId);

    return user?.state ?? defaultUserState;
  };

  public addUser = (
    userId: number,
    state: Pick<TVoiceUserState, 'micMuted' | 'soundMuted'>
  ) => {
    if (this.getUser(userId)) return;

    if (this.state.users.length === 0) {
      this.state.activeSince = Date.now();
    }

    this.state.users.push({
      userId,
      state: {
        ...defaultUserState,
        ...state
      }
    });
  };

  public removeUser = (userId: number) => {
    this.state.users = this.state.users.filter((u) => u.userId !== userId);
    if (this.state.users.length === 0) {
      this.state.activeSince = null;
    }
    this.cleanupUserResources(userId);
  };

  private cleanupUserResources = (userId: number) => {
    this.removeProducerTransport(userId);
    this.removeConsumerTransport(userId);

    this.removeProducer(userId, StreamKind.AUDIO);
    this.removeProducer(userId, StreamKind.VIDEO);
    this.removeProducer(userId, StreamKind.SCREEN);
    this.removeProducer(userId, StreamKind.SCREEN_AUDIO);

    if (this.consumers[userId]) {
      Object.values(this.consumers[userId]).forEach((consumer) => {
        consumer.close();
      });

      delete this.consumers[userId];
    }

    Object.keys(this.consumers).forEach((consumerUserIdStr) => {
      const consumerId = parseInt(consumerUserIdStr);
      const userConsumers = this.consumers[consumerId];
      if (consumerId === userId || !userConsumers) return;

      Object.keys(userConsumers).forEach((key) => {
        if (key.startsWith(`${userId}-`)) {
          userConsumers[key]?.close();
          delete userConsumers[key];
        }
      });
    });
  };

  public updateUserState = (
    userId: number,
    newState: Partial<TChannelState['users'][0]['state']>
  ) => {
    const user = this.getUser(userId);

    if (!user) return;

    user.state = { ...user.state, ...newState };
  };

  // rtpCapabilities are identical across all routers in this channel (same
  // mediaCodecs), so any router answers join.ts. Keep for backward-compat.
  public getRouter = (): Router<AppData> => {
    const first = this.routers.values().next().value;
    if (!first) throw new Error('Router not initialized yet');
    return first;
  };

  public getWorkerIndexForUser = (userId: number): number => {
    const existing = this.userWorkerIndex.get(userId);
    if (existing !== undefined) return existing;
    const slotCount = getAllWorkers().length;
    const idx = this.rrCursor % slotCount;
    this.rrCursor++;
    this.userWorkerIndex.set(userId, idx);
    return idx;
  };

  public getRouterForUser = (userId: number): Router<AppData> => {
    const idx = this.getWorkerIndexForUser(userId);
    const router = this.routers.get(idx);
    if (!router) throw new Error(`Router for worker ${idx} not initialized`);
    return router;
  };

  private createRouters = async () => {
    const slots = getAllWorkers();
    for (const slot of slots) {
      const router = await slot.worker.createRouter(defaultRouterOptions);
      this.routers.set(slot.index, router);
    }
  };

  public createTransport = async (userId: number) => {
    const workerIndex = this.getWorkerIndexForUser(userId);
    const router = this.routers.get(workerIndex);
    if (!router) throw new Error(`Router for worker ${workerIndex} missing`);
    const { webRtcServer } = getWorkerSlot(workerIndex);

    const maxBitrate = config.webRtc.maxBitrate;

    const transport = await router.createWebRtcTransport({
      webRtcServer,
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      preferTcp: false,
      initialAvailableOutgoingBitrate: Math.min(10000000, maxBitrate)
    });

    await transport.setMaxIncomingBitrate(maxBitrate);
    await transport.setMaxOutgoingBitrate(maxBitrate);

    const params: TTransportParams = {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters
    };

    return { transport, params };
  };

  // pipe a producer from its owning router to the destination worker's router
  // idempotent: tracks completed pipes per producer to avoid redundant calls
  public ensureProducerOnRouter = async (
    producer: Producer<AppData>,
    destWorkerIndex: number
  ): Promise<void> => {
    const appData = producer.appData as AppData & { workerIndex?: number };
    const ownerIndex = appData.workerIndex;
    if (ownerIndex === undefined || ownerIndex === destWorkerIndex) return;

    let piped = this.pipedProducers.get(producer.id);
    if (!piped) {
      piped = new Set<number>();
      this.pipedProducers.set(producer.id, piped);
    }
    if (piped.has(destWorkerIndex)) return;

    // Register the in-flight promise BEFORE awaiting so a concurrent consume
    // of the same producer to the same worker awaits it instead of issuing a
    // duplicate pipeToRouter. Without this, two listeners on the same foreign
    // worker both pass the piped.has() check and the second pipe throws on
    // the dest router => "heard by some but not all" after a re-consume burst.
    const key = `${producer.id}-${destWorkerIndex}`;
    const inflight = this.pipePromises.get(key);
    if (inflight) return inflight;

    const srcRouter = this.routers.get(ownerIndex);
    const destRouter = this.routers.get(destWorkerIndex);
    if (!srcRouter || !destRouter) return;

    const pipePromise = (async () => {
      await srcRouter.pipeToRouter({
        producerId: producer.id,
        router: destRouter
      });
      piped.add(destWorkerIndex);
    })().finally(() => {
      this.pipePromises.delete(key);
    });

    this.pipePromises.set(key, pipePromise);

    producer.observer.once('close', () => {
      this.pipedProducers.delete(producer.id);
    });

    return pipePromise;
  };

  public createConsumerTransport = async (userId: number) => {
    const { transport, params } = await this.createTransport(userId);

    this.consumerTransports[userId] = transport;

    transport.observer.on('close', () => {
      delete this.consumerTransports[userId];

      if (this.consumers[userId]) {
        Object.values(this.consumers[userId]).forEach((consumer) => {
          consumer.close();
        });

        delete this.consumers[userId];
      }
    });

    transport.on('dtlsstatechange', (state) => {
      if (state === 'failed' || state === 'closed') {
        this.removeConsumerTransport(userId);
      }
    });

    return params;
  };

  public removeConsumerTransport = (userId: number) => {
    const transport = this.consumerTransports[userId];

    if (!transport) return;

    transport.close();
  };

  public getConsumerTransport = (userId: number) => {
    return this.consumerTransports[userId];
  };

  public createProducerTransport = async (userId: number) => {
    const { params, transport } = await this.createTransport(userId);

    this.producerTransports[userId] = transport;

    transport.observer.on('close', () => {
      delete this.producerTransports[userId];

      this.removeProducer(userId, StreamKind.AUDIO);
      this.removeProducer(userId, StreamKind.VIDEO);
      this.removeProducer(userId, StreamKind.SCREEN);
      this.removeProducer(userId, StreamKind.SCREEN_AUDIO);
    });

    transport.on('dtlsstatechange', (state) => {
      if (state === 'failed' || state === 'closed') {
        this.removeProducerTransport(userId);
      }
    });

    return params;
  };

  public removeProducerTransport = (userId: number) => {
    const transport = this.producerTransports[userId];

    if (!transport) return;

    transport.close();
  };

  public getProducerTransport = (userId: number) => {
    return this.producerTransports[userId];
  };

  public getProducer = (type: StreamKind, id: number) => {
    switch (type) {
      case StreamKind.VIDEO:
        return this.videoProducers[id];
      case StreamKind.AUDIO:
        return this.audioProducers[id];
      case StreamKind.SCREEN:
        return this.screenProducers[id];
      case StreamKind.SCREEN_AUDIO:
        return this.screenAudioProducers[id];
      case StreamKind.EXTERNAL_VIDEO:
        return this.externalStreamsInternal[id]?.producers.videoProducer;
      case StreamKind.EXTERNAL_AUDIO:
        return this.externalStreamsInternal[id]?.producers.audioProducer;
      default:
        return undefined;
    }
  };

  public addProducer = (
    userId: number,
    type: StreamKind,
    producer: Producer,
    qualityLayers?: TStreamQualityLayer[]
  ) => {
    // stamp owning worker idx into appData so cross-router consumes can pipe
    (producer.appData as AppData & { workerIndex?: number }).workerIndex =
      this.getWorkerIndexForUser(userId);

    if (type === StreamKind.VIDEO) {
      this.videoProducers[userId] = producer;
    } else if (type === StreamKind.AUDIO) {
      this.audioProducers[userId] = producer;
    } else if (type === StreamKind.SCREEN) {
      this.screenProducers[userId] = producer;
    } else if (type === StreamKind.SCREEN_AUDIO) {
      this.screenAudioProducers[userId] = producer;
    }

    if (qualityLayers?.length && producer.type === 'simulcast') {
      // only meaningful for spatial simulcast; SVC/simple ignored
      const expected = producer.rtpParameters.encodings?.length ?? 0;
      if (qualityLayers.length === expected) {
        this.producerQualityLayers.set(producer.id, qualityLayers);
      }
    }

    producer.observer.on('close', () => {
      this.producerQualityLayers.delete(producer.id);
      if (type === StreamKind.VIDEO) {
        delete this.videoProducers[userId];
      } else if (type === StreamKind.AUDIO) {
        delete this.audioProducers[userId];
      } else if (type === StreamKind.SCREEN) {
        delete this.screenProducers[userId];
      } else if (type === StreamKind.SCREEN_AUDIO) {
        delete this.screenAudioProducers[userId];
      }
    });
  };

  public getProducerQualityLayers = (
    remoteId: number,
    kind: StreamKind
  ): TStreamQualityLayer[] => {
    const producer = this.getProducer(kind, remoteId);
    if (!producer) return [];
    return this.producerQualityLayers.get(producer.id) ?? [];
  };

  public removeProducer(userId: number, type: StreamKind) {
    let producer: Producer | undefined;

    switch (type) {
      case StreamKind.VIDEO:
        producer = this.videoProducers[userId];
        break;
      case StreamKind.AUDIO:
        producer = this.audioProducers[userId];
        break;
      case StreamKind.SCREEN:
        producer = this.screenProducers[userId];
        break;
      case StreamKind.SCREEN_AUDIO:
        producer = this.screenAudioProducers[userId];
        break;
      default:
        return;
    }

    if (!producer) return;

    producer.close();

    if (type === StreamKind.VIDEO) {
      delete this.videoProducers[userId];
    } else if (type === StreamKind.AUDIO) {
      delete this.audioProducers[userId];
    } else if (type === StreamKind.SCREEN) {
      delete this.screenProducers[userId];
    } else if (type === StreamKind.SCREEN_AUDIO) {
      delete this.screenAudioProducers[userId];
    }
  }

  public getConsumer = (
    userId: number,
    remoteId: number,
    kind: string
  ): Consumer<AppData> | undefined => {
    return this.consumers[userId]?.[`${remoteId}-${kind}`];
  };

  public addConsumer = (
    userId: number,
    remoteId: number,
    kind: string,
    consumer: Consumer<AppData>
  ) => {
    if (!this.consumers[userId]) {
      this.consumers[userId] = {};
    }

    const key = `${remoteId}-${kind}`;
    this.consumers[userId][key] = consumer;

    consumer.observer.on('close', () => {
      delete this.consumers[userId]?.[key];
    });
  };

  public createExternalStream = (options: {
    title: string;
    key: string;
    sourceId: string;
    avatarUrl?: string;
    producers: {
      audio?: Producer;
      video?: Producer;
    };
  }) => {
    const streamId = this.externalCounter++;

    const { title, key, sourceId, avatarUrl, producers } = options;

    this.externalStreamsInternal[streamId] = {
      title,
      key,
      sourceId,
      avatarUrl,
      producers: {
        audioProducer: producers.audio,
        videoProducer: producers.video
      }
    };

    if (producers.audio) {
      this.setupExternalProducerCloseHandler(
        streamId,
        'audio',
        producers.audio
      );
    }

    if (producers.video) {
      this.setupExternalProducerCloseHandler(
        streamId,
        'video',
        producers.video
      );
    }

    this.state.externalStreams[streamId] = {
      title,
      key,
      sourceId,
      avatarUrl,
      tracks: {
        audio: !!producers.audio,
        video: !!producers.video
      }
    };

    return streamId;
  };

  private setupExternalProducerCloseHandler = (
    streamId: number,
    kind: 'audio' | 'video',
    producer: Producer
  ) => {
    producer.observer.on('close', () => {
      const internal = this.externalStreamsInternal[streamId];

      if (!internal) return;

      if (kind === 'audio') {
        delete internal.producers.audioProducer;
      } else {
        delete internal.producers.videoProducer;
      }

      const hasProducers =
        internal.producers.audioProducer || internal.producers.videoProducer;

      if (!hasProducers) {
        this.removeExternalStream(streamId);
      } else {
        const existingStream = this.state.externalStreams[streamId];

        if (existingStream) {
          existingStream.tracks = {
            audio: !!internal.producers.audioProducer,
            video: !!internal.producers.videoProducer
          };

          pubsub.publish(ServerEvents.VOICE_UPDATE_EXTERNAL_STREAM, {
            channelId: this.id,
            streamId,
            stream: existingStream
          });
        }
      }
    });
  };

  public removeExternalStream = (streamId: number) => {
    const internal = this.externalStreamsInternal[streamId];

    if (!internal) return;

    if (
      internal.producers.audioProducer &&
      !internal.producers.audioProducer.closed
    ) {
      internal.producers.audioProducer.close();
    }
    if (
      internal.producers.videoProducer &&
      !internal.producers.videoProducer.closed
    ) {
      internal.producers.videoProducer.close();
    }

    delete this.externalStreamsInternal[streamId];
    delete this.state.externalStreams[streamId];

    pubsub.publish(ServerEvents.VOICE_REMOVE_EXTERNAL_STREAM, {
      channelId: this.id,
      streamId
    });
  };

  public updateExternalStream = (
    streamId: number,
    options: {
      title?: string;
      avatarUrl?: string;
      producers?: {
        audio?: Producer;
        video?: Producer;
      };
    }
  ) => {
    const internal = this.externalStreamsInternal[streamId];

    if (!internal) return;

    const publicStream = this.state.externalStreams[streamId];

    if (!publicStream) return;

    if (options.title !== undefined) {
      internal.title = options.title;
      publicStream.title = options.title;
    }

    if (options.avatarUrl !== undefined) {
      internal.avatarUrl = options.avatarUrl;
      publicStream.avatarUrl = options.avatarUrl;
    }

    if (options.producers) {
      if (options.producers.audio !== undefined) {
        if (
          internal.producers.audioProducer &&
          !internal.producers.audioProducer.closed
        ) {
          internal.producers.audioProducer.close();
        }

        if (options.producers.audio) {
          internal.producers.audioProducer = options.producers.audio;
          this.setupExternalProducerCloseHandler(
            streamId,
            'audio',
            options.producers.audio
          );

          pubsub.publishForChannel(this.id, ServerEvents.VOICE_NEW_PRODUCER, {
            channelId: this.id,
            remoteId: streamId,
            kind: StreamKind.EXTERNAL_AUDIO
          });
        } else {
          delete internal.producers.audioProducer;
        }
      }

      if (options.producers.video !== undefined) {
        if (
          internal.producers.videoProducer &&
          !internal.producers.videoProducer.closed
        ) {
          internal.producers.videoProducer.close();
        }

        if (options.producers.video) {
          internal.producers.videoProducer = options.producers.video;
          this.setupExternalProducerCloseHandler(
            streamId,
            'video',
            options.producers.video
          );

          pubsub.publishForChannel(this.id, ServerEvents.VOICE_NEW_PRODUCER, {
            channelId: this.id,
            remoteId: streamId,
            kind: StreamKind.EXTERNAL_VIDEO
          });
        } else {
          delete internal.producers.videoProducer;
        }
      }

      publicStream.tracks = {
        audio: !!internal.producers.audioProducer,
        video: !!internal.producers.videoProducer
      };
    }

    pubsub.publish(ServerEvents.VOICE_UPDATE_EXTERNAL_STREAM, {
      channelId: this.id,
      streamId,
      stream: publicStream
    });
  };

  public getExternalStreamProducer = (
    streamId: number,
    kind: 'audio' | 'video'
  ): Producer | undefined => {
    const internal = this.externalStreamsInternal[streamId];
    if (!internal) return undefined;

    return kind === 'audio'
      ? internal.producers.audioProducer
      : internal.producers.videoProducer;
  };

  public getRemoteIds = (userId: number): TRemoteProducerIds => {
    return {
      remoteVideoIds: Object.keys(this.videoProducers)
        .filter((id) => +id !== userId)
        .map((id) => +id),
      remoteAudioIds: Object.keys(this.audioProducers)
        .filter((id) => +id !== userId)
        .map((id) => +id),
      remoteScreenIds: Object.keys(this.screenProducers)
        .filter((id) => +id !== userId)
        .map((id) => +id),
      remoteScreenAudioIds: Object.keys(this.screenAudioProducers)
        .filter((id) => +id !== userId)
        .map((id) => +id),
      remoteExternalStreamIds: Object.keys(this.externalStreamsInternal).map(
        (id) => +id
      )
    };
  };

  public getExternalStreamTracks = (
    streamId: number
  ): { audio: boolean; video: boolean } => {
    const internal = this.externalStreamsInternal[streamId];
    if (!internal) return { audio: false, video: false };

    return {
      audio: !!internal.producers.audioProducer,
      video: !!internal.producers.videoProducer
    };
  };

  public static getListenInfo = () => {
    const info = getListenInfo();
    return {
      ip: info.ip,
      announcedAddress: info.announcedAddress
    };
  };
}

export { VoiceRuntime };
