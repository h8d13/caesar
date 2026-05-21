import { Dialog } from '@/components/dialogs/dialogs';
import { openDialog } from '@/features/dialogs/actions';
import { useAdminInvites } from '@/features/server/admin/hooks';
import {
    Button,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    LoadingCard
} from '@caesar/ui';
import { Plus } from 'lucide-react';
import { memo } from 'react';
import { InvitesTable } from './invites-table';

const Invites = memo(() => {
    const { invites, limits, loading, refetch } = useAdminInvites();

    if (loading) {
        return <LoadingCard className="h-[600px]" />;
    }

    const hasCap = !!limits && limits.maxUsers > 0;
    const atCap = hasCap && limits.users >= limits.maxUsers;

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Server Invites</CardTitle>
                    <CardDescription>
                        Manage invitation links for users to join the server.
                        {hasCap && (
                            <>
                                {' '}
                                Users: {limits.users} / {limits.maxUsers}
                                {atCap && ' (cap reached)'}
                            </>
                        )}
                    </CardDescription>
                </div>
                <Button
                    onClick={() =>
                        openDialog(Dialog.CREATE_INVITE, {
                            refetch
                        })
                    }
                    className="gap-2"
                    disabled={atCap}
                    title={
                        atCap
                            ? 'Instance has reached its user limit'
                            : undefined
                    }
                >
                    <Plus className="h-4 w-4" />
                    Create Invite
                </Button>
            </CardHeader>
            <CardContent className="space-y-4">
                <InvitesTable invites={invites} refetch={refetch} />
            </CardContent>
        </Card>
    );
});

export { Invites };
