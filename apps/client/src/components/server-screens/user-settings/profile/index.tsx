import { DatePicker } from '@/components/date-picker';
import { closeServerScreens } from '@/features/server-screens/actions';
import { useOwnPublicUser } from '@/features/server/users/hooks';
import { useForm } from '@/hooks/use-form';
import { getTRPCClient } from '@/lib/trpc';
import {
    Button,
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Color,
    Group,
    Input,
    Textarea
} from '@sharkord/ui';
import { memo, useCallback } from 'react';
import { toast } from 'sonner';
import { AvatarManager } from './avatar-manager';
import { BannerManager } from './banner-manager';

// Birthday is stored as ISO "YYYY-MM-DD". The DatePicker speaks
// timestamps, so we translate at the boundary.
const isoToTimestamp = (iso: string): number => {
    if (!iso) return 0;
    const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return 0;
    const [, y, m, d] = match;
    return new Date(Number(y), Number(m) - 1, Number(d)).getTime();
};

const timestampToIso = (ts: number): string => {
    if (!ts) return '';
    const d = new Date(ts);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

const Profile = memo(() => {
    const ownPublicUser = useOwnPublicUser();
    const { setTrpcErrors, r, rr, values, onChange } = useForm({
        name: ownPublicUser?.name ?? '',
        bannerColor: ownPublicUser?.bannerColor ?? '#FFFFFF',
        bio: ownPublicUser?.bio ?? '',
        birthday: ownPublicUser?.birthday ?? ''
    });

    const onUpdateUser = useCallback(async () => {
        const trpc = getTRPCClient();

        try {
            await trpc.users.update.mutate({
                ...values,
                birthday: values.birthday ? values.birthday : null
            });
            toast.success('Profile updated');
        } catch (error) {
            setTrpcErrors(error);
        }
    }, [values, setTrpcErrors]);

    if (!ownPublicUser) return null;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Your Profile</CardTitle>
                <CardDescription>
                    Update your personal information and settings here.
                </CardDescription>
                <CardAction>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={closeServerScreens}>
                            Cancel
                        </Button>
                        <Button onClick={onUpdateUser}>Save Changes</Button>
                    </div>
                </CardAction>
            </CardHeader>
            <CardContent className="space-y-4">
                <AvatarManager user={ownPublicUser} />

                <Group label="Username">
                    <Input placeholder="Username" {...r('name')} />
                </Group>

                <Group label="Bio">
                    <Textarea
                        placeholder="Tell us about yourself..."
                        {...r('bio')}
                    />
                </Group>

                <Group
                    label="Birthday"
                    help="Optional. Online users see a one-time notification the day before."
                >
                    <DatePicker
                        value={isoToTimestamp(values.birthday)}
                        onChange={(ts) =>
                            onChange('birthday', timestampToIso(ts))
                        }
                        placeholder="Select your birthday..."
                    />
                </Group>

                <Group label="Banner color">
                    <Color {...rr('bannerColor')} defaultValue="#FFFFFF" />
                </Group>

                <BannerManager user={ownPublicUser} />
            </CardContent>
        </Card>
    );
});

export { Profile };
