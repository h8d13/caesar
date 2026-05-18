import { UserAvatar } from '@/components/user-avatar';
import type { TVoiceUser } from '@/features/server/types';
import { useSpeakingIntensity } from '@/features/server/voice/hooks';
import { getRenderedUsername } from '@/helpers/get-rendered-username';
import { getSocialCreditColor } from '@/helpers/get-social-credit-color';
import { cn } from '@/lib/utils';
import {
    HeadphoneOff,
    Headphones,
    Mic,
    MicOff,
    Monitor,
    Video
} from 'lucide-react';
import { memo } from 'react';
import { UserPopover } from '../user-popover';

type TVoiceUserProps = {
    userId: number;
    user: TVoiceUser;
};

const VoiceUser = memo(({ user }: TVoiceUserProps) => {
    const speakingIntensity = useSpeakingIntensity(user.id);
    const speakingClass =
        !user.state.micMuted && speakingIntensity > 0
            ? speakingIntensity === 1
                ? 'speaking-effect-low'
                : speakingIntensity === 2
                  ? 'speaking-effect-medium'
                  : 'speaking-effect-high'
            : '';

    return (
        <UserPopover userId={user.id}>
            <div className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent/30 text-sm">
                <UserAvatar
                    userId={user.id}
                    className={cn('h-5 w-5 rounded-full', speakingClass)}
                    showUserPopover={false}
                    showStatusBadge={false}
                />

                <span
                    className="flex-1 truncate text-xs"
                    style={{
                        color: getSocialCreditColor(user.socialCredit ?? 0)
                    }}
                >
                    {getRenderedUsername(user, user.id)}
                </span>

                <div className="flex items-center gap-1 opacity-60">
                    <div>
                        {user.state.micMuted ? (
                            <MicOff className="h-3 w-3 text-red-500" />
                        ) : (
                            <Mic className="h-3 w-3 text-green-500" />
                        )}
                    </div>

                    <div>
                        {user.state.soundMuted ? (
                            <HeadphoneOff className="h-3 w-3 text-red-500" />
                        ) : (
                            <Headphones className="h-3 w-3 text-green-500" />
                        )}
                    </div>

                    {user.state.webcamEnabled && (
                        <Video className="h-3 w-3 text-blue-500" />
                    )}

                    {user.state.sharingScreen && (
                        <Monitor className="h-3 w-3 text-purple-500" />
                    )}
                </div>
            </div>
        </UserPopover>
    );
});

export { VoiceUser };
