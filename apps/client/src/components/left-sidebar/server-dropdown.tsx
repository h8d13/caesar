import { openServerScreen } from '@/features/server-screens/actions';
import { disconnectFromServer } from '@/features/server/actions';
import { useCan } from '@/features/server/hooks';
import { Permission } from '@caesar/shared';
import { Button } from '@caesar/ui';
import { LogOut, Settings } from 'lucide-react';
import { memo, useMemo } from 'react';
import { ServerScreen } from '../server-screens/screens';

// Header actions: logout is always visible, cog is admin-only.
const ServerDropdownMenu = memo(() => {
    const can = useCan();

    const isAdmin = useMemo(
        () =>
            can([
                Permission.MANAGE_SETTINGS,
                Permission.MANAGE_ROLES,
                Permission.MANAGE_EMOJIS,
                Permission.MANAGE_STORAGE,
                Permission.MANAGE_USERS,
                Permission.MANAGE_INVITES
            ]),
        [can]
    );

    return (
        <div className="flex items-center gap-1">
            {isAdmin && (
                <Button
                    variant="ghost"
                    size="icon"
                    title="Server settings"
                    onClick={() =>
                        openServerScreen(ServerScreen.SERVER_SETTINGS)
                    }
                >
                    <Settings className="h-5 w-5 text-muted-foreground" />
                </Button>
            )}
            <Button
                variant="ghost"
                size="icon"
                title="Log out"
                onClick={disconnectFromServer}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
                <LogOut className="h-5 w-5" />
            </Button>
        </div>
    );
});

export { ServerDropdownMenu };
