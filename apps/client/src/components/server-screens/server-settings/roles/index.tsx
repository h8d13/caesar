import { useAdminRoles } from '@/features/server/admin/hooks';
import { OWNER_ROLE_ID } from '@caesar/shared';
import { Card, CardContent, LoadingCard } from '@caesar/ui';
import { memo, useMemo, useState } from 'react';
import { RolesList } from './roles-list';
import { UpdateRole } from './update-role';

const Roles = memo(() => {
    const { roles, refetch, loading } = useAdminRoles();

    const [selectedRoleId, setSelectedRoleId] = useState<number | undefined>();

    // The owner role implicitly has every permission and isn't editable, so
    // it's excluded from role management entirely (not listed, not selectable).
    const manageableRoles = useMemo(
        () => roles.filter((role) => role.id !== OWNER_ROLE_ID),
        [roles]
    );

    const selectedRole = useMemo(() => {
        return manageableRoles.find((r) => r.id === selectedRoleId) || null;
    }, [manageableRoles, selectedRoleId]);

    if (loading) {
        return <LoadingCard className="h-[600px]" />;
    }

    return (
        <div className="flex flex-col gap-6 sm:flex-row">
            <RolesList
                roles={manageableRoles}
                selectedRoleId={selectedRoleId}
                setSelectedRoleId={setSelectedRoleId}
                refetch={refetch}
            />

            {selectedRole ? (
                <UpdateRole
                    key={selectedRole.id}
                    selectedRole={selectedRole}
                    setSelectedRoleId={setSelectedRoleId}
                    refetch={refetch}
                />
            ) : (
                <Card className="flex flex-1 items-center justify-center">
                    <CardContent className="py-12 text-center text-muted-foreground">
                        Select a role to edit or create a new one
                    </CardContent>
                </Card>
            )}
        </div>
    );
});

export { Roles };
