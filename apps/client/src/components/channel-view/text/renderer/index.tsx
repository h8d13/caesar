import { RelativeTime } from '@/components/relative-time';
import { useChannelById } from '@/features/server/channels/hooks';
import { useOwnUserId, useUserById } from '@/features/server/users/hooks';
import { getFileUrl } from '@/helpers/get-file-url';
import { getRenderedUsername } from '@/helpers/get-rendered-username';
import { dmKey, hasPriv, openStreamed } from '@/lib/e2ee';
import { useDmE2eeContext } from '@/lib/use-dm-e2ee';
import { cn } from '@/lib/utils';
import {
    audioExtensions,
    imageExtensions,
    isEmojiOnlyMessage,
    videoExtensions,
    type TFile,
    type TJoinedMessage,
    type TMessageMetadata
} from '@caesar/shared';
import { Tooltip } from '@caesar/ui';
import { memo, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { FileCard } from '../file-card';
import { MessageReactions } from '../message-reactions';
import { MessageScVotes } from '../message-sc-votes';
import { AudioOverride } from '../overrides/audio';
import { EmbedOverride } from '../overrides/embed';
import { ImageOverride } from '../overrides/image';
import { VideoOverride } from '../overrides/video';
import { renderMessageContent } from './render-content';
import type { TFoundMedia } from './types';

type TMessageRendererProps = {
    message: TJoinedMessage;
    disableFiles?: boolean;
    disableReactions?: boolean;
    disableVotes?: boolean;
};

const MessageRenderer = memo(
    ({
        message,
        disableFiles,
        disableReactions,
        disableVotes
    }: TMessageRendererProps) => {
        const ownUserId = useOwnUserId();
        const editedByUser = useUserById(message.editedBy ?? -1);
        const channel = useChannelById(message.channelId);
        // ephemeral DM messages carry an expiresAt; the matching file
        // bytes were sealed with the same dmKey at upload time. inline
        // media previews are skipped for these (MVP: download-only) and
        // the file card click hijacks the link to decrypt + blob-URL.
        const isEphemeralEncrypted =
            !!channel?.isDm && message.expiresAt != null;
        const e2eeCtx = useDmE2eeContext(message.channelId, channel?.isDm);
        const canDecryptFiles =
            isEphemeralEncrypted &&
            hasPriv() &&
            !!e2eeCtx?.peerPublicKey &&
            e2eeCtx.peerUserId !== null &&
            ownUserId !== undefined;

        const downloadEncryptedFile = useCallback(
            async (file: TFile) => {
                if (!canDecryptFiles) {
                    toast.error(
                        'Cannot decrypt: session locked. Refresh and re-enter your password.'
                    );
                    return;
                }
                try {
                    const key = await dmKey(
                        e2eeCtx!.peerPublicKey!,
                        ownUserId!,
                        e2eeCtx!.peerUserId!
                    );
                    const res = await fetch(getFileUrl(file));
                    if (!res.ok) throw new Error(`fetch ${res.status}`);
                    const cipher = await res.blob();
                    const plain = await openStreamed(key, cipher);
                    // re-tag with octet-stream so the browser triggers a
                    // download rather than guessing from any MIME the
                    // server happened to attach.
                    const blob = new Blob([plain], {
                        type: 'application/octet-stream'
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = file.originalName;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                } catch (err) {
                    console.error('encrypted file open failed', err);
                    toast.error('Failed to decrypt file.');
                }
            },
            [canDecryptFiles, e2eeCtx, ownUserId]
        );

        const emojiOnly = useMemo(
            () => isEmojiOnlyMessage(message.content),
            [message.content]
        );

        const { foundMedia, messageHtml } = useMemo(() => {
            const foundMedia: TFoundMedia[] = [];

            const messageHtml = renderMessageContent(
                message.content ?? '',
                message.id,
                (found) => foundMedia.push(found)
            );

            return { messageHtml, foundMedia };
        }, [message.content, message.id]);

        const allMedia = useMemo(() => {
            // MVP: ephemeral encrypted files have ciphertext at /public,
            // so <img>/<video> direct loads would render garbage. fall
            // back to download-only via the file card.
            if (isEphemeralEncrypted) return [...foundMedia];

            const mediaFromFiles: TFoundMedia[] = message.files
                .filter((file) => {
                    const ext = file.extension.toLowerCase();
                    return (
                        imageExtensions.includes(ext) ||
                        videoExtensions.includes(ext) ||
                        audioExtensions.includes(ext)
                    );
                })
                .map((file) => {
                    const ext = file.extension.toLowerCase();
                    const type = videoExtensions.includes(ext)
                        ? ('video' as const)
                        : audioExtensions.includes(ext)
                          ? ('audio' as const)
                          : ('image' as const);
                    return { type, url: getFileUrl(file) };
                });

            return [...foundMedia, ...mediaFromFiles];
        }, [foundMedia, message.files, isEphemeralEncrypted]);

        // Drop opengraph entries whose URL is already shown inline as a
        // direct media (image/video/audio in the message body). Hash is
        // stripped for comparison since OG fetch usually drops fragments.
        const embeds = useMemo(() => {
            const raw = (message.metadata as TMessageMetadata[] | null) ?? [];

            const normalize = (href: string) => {
                try {
                    const u = new URL(href);
                    u.hash = '';
                    return u.toString();
                } catch {
                    return href;
                }
            };

            const inlineMediaUrls = new Set(
                allMedia.map((item) => normalize(item.url))
            );

            return raw.filter(
                (entry) =>
                    entry?.url && !inlineMediaUrls.has(normalize(entry.url))
            );
        }, [message.metadata, allMedia]);

        return (
            <div className="flex flex-col">
                <div
                    className={cn(
                        'prose max-w-full overflow-hidden wrap-break-word msg-content',
                        emojiOnly && 'emoji-only'
                    )}
                >
                    {messageHtml}
                    {message.editedAt ? (
                        <Tooltip
                            content={
                                <div className="flex flex-col">
                                    <RelativeTime
                                        date={new Date(message.editedAt)}
                                    >
                                        {(relativeTime) => (
                                            <span className="text-secondary text-xs">
                                                {editedByUser
                                                    ? getRenderedUsername(
                                                          editedByUser,
                                                          message.editedBy ??
                                                              undefined
                                                      )
                                                    : 'Unknown User'}{' '}
                                                {relativeTime}
                                            </span>
                                        )}
                                    </RelativeTime>
                                </div>
                            }
                        >
                            <span className="msg-edit ml-1 text-xs text-muted-foreground">
                                (edited)
                            </span>
                        </Tooltip>
                    ) : (
                        <span></span>
                    )}
                </div>

                {allMedia.map((media, index) => {
                    if (media.type === 'image') {
                        return (
                            <ImageOverride
                                src={media.url}
                                key={`media-image-${index}`}
                            />
                        );
                    }

                    if (media.type === 'video') {
                        return (
                            <VideoOverride
                                src={media.url}
                                key={`media-video-${index}`}
                            />
                        );
                    }

                    if (media.type === 'audio') {
                        return (
                            <AudioOverride
                                src={media.url}
                                key={`media-audio-${index}`}
                            />
                        );
                    }

                    return null;
                })}

                {embeds.map((meta) => (
                    <EmbedOverride key={meta.url} metadata={meta} />
                ))}

                {!disableReactions && (
                    <div className="flex items-center gap-2 mt-1">
                        {!disableVotes && (
                            <MessageScVotes
                                messageId={message.id}
                                messageUserId={message.userId}
                                scVotes={message.scVotes}
                            />
                        )}
                        <MessageReactions
                            reactions={message.reactions}
                            messageId={message.id}
                        />
                    </div>
                )}

                {/* No per-file delete here: deleting the message already
                    removes its attachments (delete-message.ts drops every
                    file row and blob first), so a second affordance only
                    differed on multi-file messages. The mod view keeps its
                    own FileCard remove for moderation. */}
                {message.files.length > 0 && !disableFiles && (
                    <div className="flex gap-1 flex-wrap">
                        {message.files.map((file) =>
                            isEphemeralEncrypted ? (
                                <FileCard
                                    key={file.id}
                                    name={file.originalName}
                                    extension={file.extension}
                                    size={file.size}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        void downloadEncryptedFile(file);
                                    }}
                                />
                            ) : (
                                <FileCard
                                    key={file.id}
                                    name={file.originalName}
                                    extension={file.extension}
                                    size={file.size}
                                    href={getFileUrl(file)}
                                />
                            )
                        )}
                    </div>
                )}
            </div>
        );
    }
);

export { MessageRenderer };
