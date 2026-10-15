import { PaginatedTable } from '@/components/paginated-table';
import { UserAvatar } from '@/components/user-avatar';
import type { useAdminInvites } from '@/features/server/admin/hooks';
import { ActivityLogType } from '@caesar/shared';
import { Badge } from '@caesar/ui';
import { format, formatDistanceToNow } from 'date-fns';
import { memo, useCallback } from 'react';

type TInviteLogEntry = ReturnType<typeof useAdminInvites>['log'][number];

const eventLabels: Record<string, string> = {
    [ActivityLogType.CREATED_INVITE]: 'Created',
    [ActivityLogType.USED_INVITE]: 'Used',
    [ActivityLogType.DELETED_INVITE]: 'Deleted'
};

const getCode = (entry: TInviteLogEntry) =>
    entry.details && 'code' in entry.details ? String(entry.details.code) : '';

const InviteLog = memo(({ log }: { log: TInviteLogEntry[] }) => {
    const searchFilter = useCallback(
        (entry: TInviteLogEntry, searchTerm: string) => {
            const query = searchTerm.toLowerCase();

            return (
                getCode(entry).toLowerCase().includes(query) ||
                (eventLabels[entry.type] ?? '').toLowerCase().includes(query)
            );
        },
        []
    );

    return (
        <PaginatedTable
            items={log}
            renderRow={(entry) => (
                <div
                    key={entry.id}
                    className="grid grid-cols-[110px_80px_50px_1fr] gap-4 px-4 py-3 text-sm hover:bg-muted/30 transition-colors"
                >
                    <div
                        className="flex items-center text-xs text-muted-foreground"
                        title={format(entry.createdAt, 'PPP p')}
                    >
                        {formatDistanceToNow(entry.createdAt, {
                            addSuffix: true
                        })}
                    </div>
                    <div className="flex items-center">
                        <Badge variant="outline" className="text-xs">
                            {eventLabels[entry.type] ?? entry.type}
                        </Badge>
                    </div>
                    <div className="flex items-center">
                        <UserAvatar userId={entry.userId} showUserPopover />
                    </div>
                    <div className="flex items-center min-w-0">
                        <code className="text-xs font-mono bg-muted px-2 py-1 rounded truncate">
                            {getCode(entry)}
                        </code>
                    </div>
                </div>
            )}
            searchFilter={searchFilter}
            headerColumns={
                <>
                    <div>When</div>
                    <div>Event</div>
                    <div>User</div>
                    <div>Code</div>
                </>
            }
            gridCols="grid-cols-[110px_80px_50px_1fr]"
            itemsPerPage={10}
            searchPlaceholder="Search log by code or event..."
            emptyMessage="No invite activity yet"
        />
    );
});

export { InviteLog };
