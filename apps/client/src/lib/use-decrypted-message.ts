// Per-message decryption hook for ephemeral E2EE DMs.
// react-query caches by (message.id, content) so re-renders don't redo AES.

import { useOwnUserId } from '@/features/server/users/hooks';
import { type TJoinedMessage } from '@caesar/shared';
import { useQuery } from '@tanstack/react-query';
import { dmKey, hasPriv, open } from './e2ee';
import { useDmE2eeContext } from './use-dm-e2ee';

// Bundle the crypto-context fields a caller needs for write paths
// (encrypting on edit). null when the message can't be encrypted: not
// in an ephemeral DM, peer hasn't registered a key, or we don't know
// our own userId yet.
type TE2eeWriteContext = {
    ownUserId: number;
    peerUserId: number;
    peerPublicKey: Uint8Array;
};

type TDecryptResult = {
    content: string;
    replyContent: string | null;
    e2ee: TE2eeWriteContext | null;
    status: 'plaintext' | 'decrypted' | 'expired';
};

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
        staleTime: Infinity,
        retry: false
    });

    // replyTo: server tells us via replyTo.expiresAt whether the parent
    // was ephemeral. Three render outcomes for the reply preview:
    //   parent had expiresAt null   => render parent.content verbatim.
    //   parent was ephemeral + key  => decrypt and render plaintext.
    //   parent was ephemeral + no key (post-refresh) => null sentinel; the
    //                                                  view renders the
    //                                                  generic fallback.
    const replyToId = message.replyTo?.id ?? null;
    const replyToContent = message.replyTo?.content ?? null;
    const replyToWasEphemeral = message.replyTo?.expiresAt != null;

    const canDecryptReply =
        replyToWasEphemeral &&
        replyToId !== null &&
        replyToContent !== null &&
        hasPriv() &&
        ctx?.peerPublicKey != null &&
        ctx.peerUserId !== null &&
        ownUserId !== undefined;

    const { data: replyDecrypted } = useQuery({
        enabled: canDecryptReply,
        queryKey: ['e2ee', 'decrypt-reply', replyToId, replyToContent],
        queryFn: async () => {
            const key = await dmKey(
                ctx!.peerPublicKey!,
                ownUserId!,
                ctx!.peerUserId!
            );
            return open(key, replyToContent!);
        },
        staleTime: Infinity,
        retry: false
    });

    const finalReply: string | null = replyToWasEphemeral
        ? (replyDecrypted ?? null)
        : replyToContent;

    const e2ee: TE2eeWriteContext | null =
        ctx?.peerPublicKey != null &&
        ctx.peerUserId !== null &&
        ownUserId !== undefined
            ? {
                  ownUserId,
                  peerUserId: ctx.peerUserId,
                  peerPublicKey: ctx.peerPublicKey
              }
            : null;

    if (message.expiresAt == null) {
        return {
            status: 'plaintext',
            content: message.content ?? '',
            replyContent: finalReply,
            e2ee
        };
    }

    if (data != null) {
        return {
            status: 'decrypted',
            content: data,
            replyContent: finalReply,
            e2ee
        };
    }

    return {
        status: 'expired',
        content: '',
        replyContent: finalReply,
        e2ee
    };
};

export { useDecryptedMessage, type TDecryptResult, type TE2eeWriteContext };
