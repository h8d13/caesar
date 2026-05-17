import { TiptapInput } from '@/components/tiptap-input';
import { dmKey, hasPriv, seal } from '@/lib/e2ee';
import { getTRPCClient } from '@/lib/trpc';
import type { TE2eeWriteContext } from '@/lib/use-decrypted-message';
import { type TMessage, isEmptyMessage } from '@caesar/shared';
import { AutoFocus } from '@caesar/ui';
import { memo, useCallback, useState } from 'react';
import { toast } from 'sonner';

type TMessageEditInlineProps = {
    message: TMessage;
    // Plaintext to seed the editor. For non-ephemeral messages this is just
    // message.content; for ephemeral, the parent passes the decrypted text.
    initialContent: string;
    // null => normal plaintext edit. non-null => encrypt with these keys
    // before sending and flag isEncrypted on the mutate call.
    e2ee: TE2eeWriteContext | null;
    onBlur: () => void;
};

const MessageEditInline = memo(
    ({ message, initialContent, e2ee, onBlur }: TMessageEditInlineProps) => {
        const [value, setValue] = useState<string>(initialContent);

        const onSubmit = useCallback(
            async (newValue: string | undefined) => {
                if (!newValue || isEmptyMessage(newValue)) {
                    toast.error('Message cannot be empty');

                    onBlur();

                    return;
                }

                const trpc = getTRPCClient();
                let content = newValue;
                const isEncrypted = e2ee != null;

                if (isEncrypted) {
                    if (!hasPriv()) {
                        toast.error(
                            'Re-enter your password to edit ephemeral messages.'
                        );
                        onBlur();
                        return;
                    }
                    try {
                        const key = await dmKey(
                            e2ee.peerPublicKey,
                            e2ee.ownUserId,
                            e2ee.peerUserId
                        );
                        content = await seal(key, newValue);
                    } catch (err) {
                        console.error('e2ee seal failed on edit', err);
                        toast.error('Could not encrypt message.');
                        onBlur();
                        return;
                    }
                }

                try {
                    await trpc.messages.edit.mutate({
                        messageId: message.id,
                        content,
                        isEncrypted
                    });

                    toast.success('Message edited');
                } catch {
                    toast.error('Failed to edit message');
                } finally {
                    onBlur();
                }
            },
            [message.id, onBlur, e2ee]
        );

        return (
            <div className="flex flex-col gap-2">
                <AutoFocus>
                    <TiptapInput
                        value={value}
                        onChange={setValue}
                        onSubmit={() => onSubmit(value)}
                        onCancel={onBlur}
                    />
                </AutoFocus>
                <span className="text-xs text-primary/60">
                    Press Ctrl + Enter to save, Esc to cancel
                </span>
            </div>
        );
    }
);

export { MessageEditInline };
