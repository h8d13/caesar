- play-soundboard.ts: skips needsPermission, only does the channel+runtime guards 
==> Needs to be added to perms in server settings per roles

So the extractable block is specifically needsPermission(JOIN_VOICE_CHANNELS) +
invariant(currentVoiceChannelId) + VoiceRuntime.findById + invariant(runtime) - that's 10 routes
doing the exact same 4 lines. A tRPC middleware or a requireVoiceRuntime(ctx)

