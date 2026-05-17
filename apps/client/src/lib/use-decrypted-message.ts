// Per-message decryption hook for ephemeral E2EE DMs.
// react-query caches by (message.id, content) so re-renders don't redo AES.

import { useOwnUserId } from '@/features/server/users/hooks';
import { type TJoinedMessage } from '@caesar/shared';
import { useQuery } from '@tanstack/react-query';
import { dmKey, hasPriv, open } from './e2ee';
import { useDmE2eeContext } from './use-dm-e2ee';

type TDecryptResult =
    | { status: 'plaintext'; content: string }
    | { status: 'decrypted'; content: string }
    | { status: 'expired' };

const useDecryptedMessage = (
    message: TJoinedMessage,
    channelIsDm: boolean | undefined
): TDecryptResult => {
    const ctx = useDmE2eeContext(message.channelId, channelIsDm);
    const ownUserId = useOwnUserId();

    const canDecrypt =
        message.expiresAt != null &&
        message.content != null &&
        hasPriv() &&
        ctx?.peerPublicKey != null &&
        ctx.peerUserId !== null &&
        ownUserId !== undefined;

    const { data } = useQuery({
        enabled: canDecrypt,
        queryKey: ['e2ee', 'decrypt', message.id, message.content],
        queryFn: async () => {
            const key = await dmKey(
                ctx!.peerPublicKey!,
                ownUserId!,
                ctx!.peerUserId!
            );
            return open(key, message.content!);
        },
        // single shot; messages are immutable once stored (except edit, which
        // changes message.content => new cache key).
        staleTime: Infinity,
        // unreadable ciphertext (wrong key, tamper, expired peer key) bubbles
        // up as undefined data, which the consumer treats as 'expired'.
        retry: false
    });

    if (message.expiresAt == null) {
        return { status: 'plaintext', content: message.content ?? '' };
    }

    if (data != null) {
        return { status: 'decrypted', content: data };
    }

    return { status: 'expired' };
};

export { useDecryptedMessage, type TDecryptResult };
