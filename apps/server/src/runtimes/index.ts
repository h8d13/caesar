import { ChannelType } from '@caesar/shared';
import { channels } from '@caesar/shared/db/schema';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { VoiceRuntime } from './voice';

const initVoiceRuntimes = async () => {
  const voiceChannels = await db
    .select({
      id: channels.id,
      isDm: channels.isDm
    })
    .from(channels)
    .where(eq(channels.type, ChannelType.VOICE));

  for (const channel of voiceChannels) {
    if (channel.isDm) continue; // DM runtimes start lazily on dms.call

    const runtime = new VoiceRuntime(channel.id);

    await runtime.init();
  }
};

export { initVoiceRuntimes };
