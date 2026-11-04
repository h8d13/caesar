import { UserAvatar } from '@/components/user-avatar';
import { openDialog } from '@/features/dialogs/actions';
import {
    useCategories,
    useCategoryById
} from '@/features/server/categories/hooks';
import { useChannelById, useChannels } from '@/features/server/channels/hooks';
import {
    useCan,
    useHasVisibleChannelsInCategory
} from '@/features/server/hooks';
import { useUserById } from '@/features/server/users/hooks';
import { getRenderedUsername } from '@/helpers/get-rendered-username';
import { useLatestCallback } from '@/hooks/use-latest-callback';
import { getTRPCClient } from '@/lib/trpc';
import { ChannelType, Permission, getTrpcError } from '@caesar/shared';
import { IconButton } from '@caesar/ui';
import { closestCorners } from '@dnd-kit/collision';
import { PointerActivationConstraints } from '@dnd-kit/dom';
import {
    DragDropProvider,
    DragOverlay,
    PointerSensor,
    type DragEndEvent,
    type DragOverEvent
} from '@dnd-kit/react';
import { isSortable, useSortable } from '@dnd-kit/react/sortable';
import { ChevronDown, ChevronRight, Hash, Plus, Volume2 } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CategoryContextMenu } from '../context-menus/category';
import { Dialog } from '../dialogs/dialogs';
import { Protect } from '../protect';
import { Channels } from './channels';
import { useCategoryExpanded } from './hooks';

// Module-level so the provider never rebinds sensors. 8px before a drag
// starts: the default activates instantly on a handle under a mouse, and
// every channel row is its own handle, so clicks would never select. A
// factory since constraints keep per-gesture state.
const SENSORS = [
    PointerSensor.configure({
        activationConstraints: () => [
            new PointerActivationConstraints.Distance({ value: 8 })
        ]
    })
];
const NO_CHANNELS: number[] = [];

type TCategoryProps = {
    categoryId: number;
    index: number;
    channelIds: number[];
};

const Category = memo(({ categoryId, index, channelIds }: TCategoryProps) => {
    const can = useCan();
    const hasVisibleChannelsInCategory =
        useHasVisibleChannelsInCategory(categoryId);
    const { expanded, toggleExpanded } = useCategoryExpanded(categoryId);
    const category = useCategoryById(categoryId);

    // accept: only other categories, so channel and member drags never
    // resolve to a category and need mapping back to their own target.
    const { ref, handleRef, isDragging } = useSortable({
        id: `cat-${categoryId}`,
        index,
        type: 'category',
        accept: 'category',
        collisionDetector: closestCorners,
        disabled: !can(Permission.MANAGE_CATEGORIES)
    });

    const onCreateChannelClick = useCallback(() => {
        openDialog(Dialog.CREATE_CHANNEL, { categoryId });
    }, [categoryId]);

    if (
        !category ||
        (!hasVisibleChannelsInCategory && !can(Permission.MANAGE_CHANNELS))
    ) {
        return null;
    }

    const ChevronIcon = expanded ? ChevronDown : ChevronRight;

    return (
        <div
            ref={ref}
            style={{ opacity: isDragging ? 0.5 : 1 }}
            // pb-4 not mb-4: @dnd-kit measures via getBoundingClientRect
            // which excludes margins. Padding is in the rect.
            className="pb-4"
        >
            <div className="mb-1 flex w-full items-center px-2 py-1 text-xs font-semibold text-muted-foreground">
                <div className="flex w-full items-stretch gap-1">
                    <IconButton
                        variant="ghost"
                        size="sm"
                        icon={ChevronIcon}
                        onClick={toggleExpanded}
                        title={
                            expanded ? 'Collapse category' : 'Expand category'
                        }
                    />
                    <CategoryContextMenu categoryId={category.id}>
                        <span
                            ref={handleRef}
                            className="cursor-grab active:cursor-grabbing flex-1"
                        >
                            {category.name}
                        </span>
                    </CategoryContextMenu>
                </div>

                <Protect permission={Permission.MANAGE_CHANNELS}>
                    <IconButton
                        variant="ghost"
                        size="sm"
                        icon={Plus}
                        onClick={onCreateChannelClick}
                        title="Create channel"
                    />
                </Protect>
            </div>

            {expanded && (
                <Channels categoryId={category.id} channelIds={channelIds} />
            )}
        </div>
    );
});

// Category a channel drag is over: a channel row's sortable group, or the
// list droppable (drop-cat-N) catching empty categories and list ends.
const getTargetCategoryId = (
    target: DragOverEvent['operation']['target']
): number | null => {
    if (!target) return null;
    if (isSortable(target)) return Number(target.group);
    const id = String(target.id);
    return id.startsWith('drop-cat-') ? Number(id.slice(9)) : null;
};

const Categories = memo(() => {
    const categories = useCategories();
    const channels = useChannels();

    // category -> ordered channel ids from redux. DMs have null categoryId.
    const baseByCat = useMemo(() => {
        const m: Record<number, number[]> = {};
        const sorted = [...channels].sort((a, b) => a.position - b.position);
        for (const ch of sorted) {
            if (ch.categoryId === null) continue;
            // no `??=`: the React Compiler skips the whole file on it
            const ids = m[ch.categoryId] ?? [];

            ids.push(ch.id);
            m[ch.categoryId] = ids;
        }
        return m;
    }, [channels]);

    // Cross-category layout during and after a drag. onDragOver moves the
    // dragged channel into the destination list so it renders there (the
    // insertion preview); same-list moves are left to dnd-kit's optimistic
    // sorting, which reorders the DOM without a React render. Kept until
    // redux catches up (then cleared during render below) to avoid snap-back.
    const [override, setOverride] = useState<Record<number, number[]> | null>(
        null
    );
    const [dragging, setDragging] = useState(false);

    // baseByCat omits categories with zero channels (loop skips them),
    // override can hold `[sCat]: []` after a cross-cat drag drains the
    // source. Strip empties before comparing so the override clears
    // instead of lingering forever and shadowing future drags.
    if (
        !dragging &&
        override &&
        JSON.stringify(
            Object.fromEntries(
                Object.entries(override).filter(([, ids]) => ids.length > 0)
            )
        ) === JSON.stringify(baseByCat)
    ) {
        setOverride(null);
    }

    const byCat = override ?? baseByCat;

    const handleDragStart = useCallback(() => {
        setDragging(true);
    }, []);

    const handleDragOver = useLatestCallback((event: DragOverEvent) => {
        const { source, target } = event.operation;
        if (!source || !target || !isSortable(source)) return;
        if (source.type !== 'channel') return;

        const aCat = Number(source.group);
        const oCat = getTargetCategoryId(target);
        if (oCat === null || aCat === oCat) return;

        // We own cross-list moves: the row remounts in its new list. Stop the
        // optimistic plugin from also moving the DOM node across parents,
        // which React could no longer reconcile.
        event.preventDefault();

        const chId = Number(String(source.id).slice(3));
        const oId = String(target.id);
        setOverride((prev) => {
            const next = { ...(prev ?? baseByCat) };
            next[aCat] = (next[aCat] ?? []).filter((id) => id !== chId);
            const dest = [...(next[oCat] ?? [])];
            let idx = dest.length;
            if (oId.startsWith('ch-')) {
                const i = dest.indexOf(Number(oId.slice(3)));
                if (i !== -1) idx = i;
            }
            dest.splice(idx, 0, chId);
            next[oCat] = dest;
            return next;
        });
    });

    const handleDragEnd = useLatestCallback(async (event: DragEndEvent) => {
        const { source, target } = event.operation;
        setDragging(false);
        // Canceled sorts are rolled back in the DOM by dnd-kit itself.
        if (event.canceled || !source) {
            setOverride(null);
            return;
        }

        const trpc = getTRPCClient();

        // Voice-member drag: drop onto a different voice channel to move
        // them. Only voice channel rows accept members (channels.tsx).
        // ACL is enforced server-side.
        if (source.type === 'voice-user') {
            setOverride(null);
            if (!target) return;

            const userId = Number(source.data.userId);
            const sourceChannelId = source.data.channelId as number;
            const destChannelId = Number(String(target.id).slice(3));

            if (destChannelId === sourceChannelId) return;

            const dest = channels.find((c) => c.id === destChannelId);
            if (dest?.type !== ChannelType.VOICE || dest.isDm) return;

            try {
                await trpc.voice.moveUser.mutate({
                    userId,
                    channelId: destChannelId
                });
            } catch (e) {
                toast.error(getTrpcError(e, 'Failed to move member'));
            }
            return;
        }

        if (!isSortable(source)) {
            setOverride(null);
            return;
        }

        // Sortables carry their final slot: index within group, after both
        // optimistic same-list moves and our cross-list re-renders.
        if (source.type === 'category') {
            setOverride(null);
            const from = source.initialIndex;
            const to = source.index;
            if (from === to) return;
            const reordered = categories.map((cat) => cat.id);
            const [moved] = reordered.splice(from, 1);
            reordered.splice(to, 0, moved);
            try {
                await trpc.categories.reorder.mutate({
                    categoryIds: reordered
                });
            } catch (e) {
                toast.error(getTrpcError(e, 'Failed to reorder categories'));
            }
            return;
        }

        const chId = Number(String(source.id).slice(3));
        const oCat = Number(source.group);
        // Source must be looked up in BASE (redux) — `byCat` already
        // reflects the onDragOver-driven cross-list move.
        let sCat: number | null = null;
        for (const k in baseByCat) {
            if (baseByCat[Number(k)].includes(chId)) {
                sCat = Number(k);
                break;
            }
        }
        if (sCat === null) {
            setOverride(null);
            return;
        }

        const destIds = (byCat[oCat] ?? []).filter((id) => id !== chId);
        destIds.splice(source.index, 0, chId);

        // Persist the post-drop layout so the UI doesn't snap back while
        // the server confirms; the check above clears it on redux update.
        // Intra-category drag has sCat === oCat: writing both [oCat] and
        // [sCat] into the same object literal collapses on the duplicate
        // key (sourceIds wins, dragged channel vanishes from the override
        // until refresh). Only write the source entry when categories
        // actually differ.
        const sourceIds = (byCat[sCat] ?? baseByCat[sCat] ?? []).filter(
            (id) => id !== chId
        );
        setOverride((prev) => {
            const next = { ...(prev ?? baseByCat), [oCat]: destIds };
            if (sCat !== oCat) next[sCat] = sourceIds;
            return next;
        });

        if (sCat === oCat) {
            const base = baseByCat[oCat] ?? [];
            if (
                base.length === destIds.length &&
                base.every((v, i) => v === destIds[i])
            ) {
                setOverride(null);
                return;
            }
            try {
                await trpc.channels.reorder.mutate({
                    categoryId: oCat,
                    channelIds: destIds
                });
            } catch (e) {
                toast.error(getTrpcError(e, 'Failed to reorder channels'));
                setOverride(null);
            }
            return;
        }

        // Cross-category: two sequential mutations (SQLite single-writer).
        try {
            await trpc.channels.reorder.mutate({
                categoryId: sCat,
                channelIds: sourceIds
            });
            await trpc.channels.reorder.mutate({
                categoryId: oCat,
                channelIds: destIds
            });
        } catch (e) {
            toast.error(getTrpcError(e, 'Failed to move channel'));
            setOverride(null);
        }
    });

    return (
        <div className="flex-1 overflow-y-auto p-2">
            <DragDropProvider
                sensors={SENSORS}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
            >
                {categories.map((category, index) => (
                    <Category
                        key={category.id}
                        categoryId={category.id}
                        index={index}
                        channelIds={byCat[category.id] ?? NO_CHANNELS}
                    />
                ))}
                <DragOverlay>
                    {(source) => <DragGhost id={String(source.id)} />}
                </DragOverlay>
            </DragDropProvider>
            <Protect permission={Permission.MANAGE_CATEGORIES}>
                <button
                    type="button"
                    onClick={() => openDialog(Dialog.CREATE_CATEGORY)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                    <Plus className="h-4 w-4" />
                    Add Category
                </button>
            </Protect>
        </div>
    );
});

// Floating snapshot rendered while dragging. Decouples the dragged element
// from layout so sorting gets a stable neighbor height — fixes the
// categories grow/shrink artifact and gives a clear cursor preview.
const DragGhost = memo(({ id }: { id: string }) => {
    if (id.startsWith('cat-')) return <CatGhost id={Number(id.slice(4))} />;
    if (id.startsWith('ch-')) return <ChGhost id={Number(id.slice(3))} />;
    if (id.startsWith('vu-')) return <VuGhost id={Number(id.slice(3))} />;
    return null;
});

const VuGhost = memo(({ id }: { id: number }) => {
    const user = useUserById(id);
    if (!user) return null;
    return (
        <div className="flex items-center gap-2 rounded px-2 py-1 text-xs text-muted-foreground bg-card border border-border shadow">
            <UserAvatar
                userId={id}
                className="h-5 w-5 rounded-full"
                showUserPopover={false}
                showStatusBadge={false}
            />
            <span>{getRenderedUsername(user, id)}</span>
        </div>
    );
});

const CatGhost = memo(({ id }: { id: number }) => {
    const cat = useCategoryById(id);
    if (!cat) return null;
    return (
        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground bg-card border border-border rounded shadow">
            {cat.name}
        </div>
    );
});

const ChGhost = memo(({ id }: { id: number }) => {
    const channel = useChannelById(id);
    if (!channel) return null;
    const Icon = channel.type === 'VOICE' ? Volume2 : Hash;
    return (
        <div className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-muted-foreground bg-card border border-border shadow">
            <Icon className="h-4 w-4" />
            <span>{channel.name}</span>
        </div>
    );
});

export { Categories };
