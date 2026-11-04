import { useLatestCallback } from '@/hooks/use-latest-callback';
import { getTRPCClient } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { ChannelType, parseTrpcErrors, type TTrpcErrors } from '@caesar/shared';
import { AutoFocus, Group, Input } from '@caesar/ui';
import { Hash, Mic } from 'lucide-react';
import { memo, useState } from 'react';
import { FormDialogFooter, FormDialogShell } from '../form-dialog-shell';
import type { TDialogBaseProps } from '../types';

type TChannelTypeItemProps = {
    icon: React.ReactNode;
    title: string;
    description: string;
    isActive: boolean;
    onClick: () => void;
};

const ChannelTypeItem = ({
    icon,
    title,
    description,
    isActive,
    onClick
}: TChannelTypeItemProps) => (
    <div
        className={cn(
            'flex items-center gap-2 p-2 rounded-md cursor-pointer',
            isActive && 'ring-2 ring-primary bg-primary/10'
        )}
        onClick={onClick}
    >
        {icon}
        <div className="flex flex-col">
            <span>{title}</span>
            <span className="text-sm text-primary/60">{description}</span>
        </div>
    </div>
);

type TCreateChannelFormProps = {
    categoryId: number;
    close: () => void;
    defaultChannelType: ChannelType;
};

// Form state lives here, inside the shell: typing re-renders this body
// only, not the dialog layers above it.
const CreateChannelForm = memo(
    ({ categoryId, close, defaultChannelType }: TCreateChannelFormProps) => {
        const [channelType, setChannelType] = useState(defaultChannelType);
        const [name, setName] = useState('New Channel');
        const [loading, setLoading] = useState(false);
        const [errors, setErrors] = useState<TTrpcErrors>({});

        const onSubmit = useLatestCallback(async () => {
            const trpc = getTRPCClient();

            setLoading(true);

            try {
                await trpc.channels.add.mutate({
                    type: channelType,
                    name,
                    categoryId
                });

                close();
            } catch (error) {
                setErrors(parseTrpcErrors(error));
            }
            // not `finally`: the React Compiler skips try/finally
            setLoading(false);
        });

        return (
            <>
                <Group label="Channel type">
                    <ChannelTypeItem
                        title="Text Channel"
                        description="Share text, images, files and more"
                        icon={<Hash className="h-6 w-6" />}
                        isActive={channelType === ChannelType.TEXT}
                        onClick={() => setChannelType(ChannelType.TEXT)}
                    />

                    <ChannelTypeItem
                        title="Voice Channel"
                        description="Hangout with voice, video and screen sharing"
                        icon={<Mic className="h-6 w-6" />}
                        isActive={channelType === ChannelType.VOICE}
                        onClick={() => setChannelType(ChannelType.VOICE)}
                    />
                </Group>

                <Group label="Channel name">
                    <AutoFocus>
                        <Input
                            placeholder="Channel name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            name="name"
                            error={errors.name}
                            resetError={setErrors}
                            onEnter={onSubmit}
                        />
                    </AutoFocus>
                </Group>

                <FormDialogFooter
                    close={close}
                    confirmLabel="Create channel"
                    onConfirm={onSubmit}
                    confirmDisabled={loading || !name || !channelType}
                />
            </>
        );
    }
);

type TCreateChannelDialogProps = TDialogBaseProps & {
    categoryId: number;
    defaultChannelType?: ChannelType;
};

const CreateChannelDialog = memo(
    ({
        isOpen,
        categoryId,
        close,
        defaultChannelType = ChannelType.TEXT
    }: TCreateChannelDialogProps) => (
        <FormDialogShell
            isOpen={isOpen}
            close={close}
            title="Create New Channel"
        >
            <CreateChannelForm
                categoryId={categoryId}
                close={close}
                defaultChannelType={defaultChannelType}
            />
        </FormDialogShell>
    )
);

export { CreateChannelDialog };
