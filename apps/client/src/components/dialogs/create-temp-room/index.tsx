import { createTempRoom } from '@/features/server/temp-rooms/actions';
import { copyTempRoomLink } from '@/features/server/temp-rooms/link';
import { useOwnPublicUser } from '@/features/server/users/hooks';
import { useForm } from '@/hooks/use-form';
import { useLatestCallback } from '@/hooks/use-latest-callback';
import { TEMP_ROOM_NAME_MAX_LENGTH } from '@caesar/shared';
import { Group, Input, Switch } from '@caesar/ui';
import { memo } from 'react';
import { FormDialogFooter, FormDialogShell } from '../form-dialog-shell';
import type { TDialogBaseProps } from '../types';

type TCreateTempRoomFormProps = {
    close: () => void;
};

// Form state lives here, inside the shell: typing re-renders this body
// only, not the dialog layers above it.
const CreateTempRoomForm = memo(({ close }: TCreateTempRoomFormProps) => {
    const ownUser = useOwnPublicUser();
    const { r, values, onChange } = useForm({
        name: '',
        guestsAllowed: true
    });

    const handleCreate = useLatestCallback(async () => {
        const room = await createTempRoom({
            name: values.name.trim() || undefined,
            guestsAllowed: values.guestsAllowed
        });

        // a failure was toasted and leaves the dialog open to retry
        if (!room) return;

        copyTempRoomLink(room.token);
        close();
    });

    return (
        <>
            <div className="space-y-4">
                <Group label="Room name">
                    <Input
                        {...r('name')}
                        placeholder={
                            ownUser ? `${ownUser.name}'s room` : 'Room name'
                        }
                        maxLength={TEMP_ROOM_NAME_MAX_LENGTH}
                        onEnter={handleCreate}
                        autoFocus
                    />
                </Group>
                <Group
                    label="Allow guests"
                    description={
                        values.guestsAllowed
                            ? 'Anyone with the link can join, without an account.'
                            : 'Members only: the link refuses anyone who is not signed in.'
                    }
                >
                    <Switch
                        checked={values.guestsAllowed}
                        onCheckedChange={(checked) =>
                            onChange('guestsAllowed', checked)
                        }
                    />
                </Group>
            </div>

            <FormDialogFooter
                close={close}
                confirmLabel="Open room"
                onConfirm={handleCreate}
            />
        </>
    );
});

const CreateTempRoomDialog = memo(({ close, isOpen }: TDialogBaseProps) => (
    <FormDialogShell
        isOpen={isOpen}
        close={close}
        title="Open a temp room"
        description="A voice room outside the channel list, joined by its link. The link is copied when the room opens."
    >
        <CreateTempRoomForm close={close} />
    </FormDialogShell>
));

export { CreateTempRoomDialog };
