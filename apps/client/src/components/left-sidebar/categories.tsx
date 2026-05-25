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
import { getTRPCClient } from '@/lib/trpc';
import { ChannelType, Permission, getTrpcError } from '@caesar/shared';
import { IconButton } from '@caesar/ui';
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    closestCorners,
    pointerWithin,
    useSensor,
    useSensors,
    type CollisionDetection,
    type DragEndEvent,
    type DragOverEvent,
    type DragStartEvent
} from '@dnd-kit/core';
import {
    SortableContext,
    useSortable,
    verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronRight, Hash, Plus, Volume2 } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CategoryContextMenu } from '../context-menus/category';
import { Dialog } from '../dialogs/dialogs';
import { Protect } from '../protect';
import { Channels } from './channels';
import { useCategoryExpanded } from './hooks';

type TCategoryProps = {
    categoryId: number;
    channelIds: number[];
};

const Category = memo(({ categoryId, channelIds }: TCategoryProps) => {
    const can = useCan();
    const hasVisibleChannelsInCategory =
        useHasVisibleChannelsInCategory(categoryId);
    const { expanded, toggleExpanded } = useCategoryExpanded(categoryId);
    const category = useCategoryById(categoryId);

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: `cat-${categoryId}` });

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
            ref={setNodeRef}
            style={{
                transform: CSS.Transform.toString(
                    transform && { ...transform, x: 0 }
                ),
                transition,
                opacity: isDragging ? 0.5 : 1
            }}
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
                            {...attributes}
                            {...listeners}
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

const Categories = memo(() => {
    const can = useCan();
    const categories = useCategories();
    const channels = useChannels();
    const categorySortableIds = useMemo(
        () => categories.map((cat) => `cat-${cat.id}`),
        [categories]
    );

    // category -> ordered channel ids from redux. DMs have null categoryId.
    const baseByCat = useMemo(() => {
        const m: Record<number, number[]> = {};
        const sorted = [...channels].sort((a, b) => a.position - b.position);
        for (const ch of sorted) {
            if (ch.categoryId === null) continue;
            (m[ch.categoryId] ??= []).push(ch.id);
        }
        return m;
    }, [channels]);

    // Optimistic state during drag. onDragOver mutates it so the destination
    // SortableContext sees the dragged channel and verticalListSortingStrategy
    // can animate its items to make space (the insertion preview). Kept until
    // redux catches up (then cleared by the effect below) to avoid snap-back.
    const [override, setOverride] = useState<Record<number, number[]> | null>(
        null
    );
    const [activeId, setActiveId] = useState<string | null>(null);

    const byCat = override ?? baseByCat;

    useEffect(() => {
        if (activeId !== null || !override) return;
        // baseByCat omits categories with zero channels (loop skips them),
        // override can hold `[sCat]: []` after a cross-cat drag drains the
        // source. Strip empties before comparing so the override clears
        // instead of lingering forever and shadowing future drags.
        const normalized = Object.fromEntries(
            Object.entries(override).filter(([, ids]) => ids.length > 0)
        );
        if (JSON.stringify(normalized) === JSON.stringify(baseByCat)) {
            setOverride(null);
        }
    }, [baseByCat, override, activeId]);

    const findCat = useCallback(
        (sortableId: string): number | null => {
            if (sortableId.startsWith('drop-cat-'))
                return Number(sortableId.slice(9));
            if (sortableId.startsWith('cat-'))
                return Number(sortableId.slice(4));
            if (sortableId.startsWith('ch-')) {
                const id = Number(sortableId.slice(3));
                for (const k in byCat) {
                    if (byCat[Number(k)].includes(id)) return Number(k);
                }
            }
            return null;
        },
        [byCat]
    );

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
    );

    // Member drags target the channel the pointer is literally inside (its
    // sortable node spans the whole channel incl. its user list). closestCorners
    // is corner-distance based and gets ambiguous between adjacent channels, so
    // restrict to pointerWithin on channel droppables; no nearest-fallback means
    // a drop in the gap simply no-ops instead of snapping to the wrong channel.
    // Channel/category reorder keeps closestCorners.
    const collisionDetection = useCallback<CollisionDetection>((args) => {
        if (String(args.active.id).startsWith('vu-')) {
            return pointerWithin(args).filter((c) =>
                String(c.id).startsWith('ch-')
            );
        }
        return closestCorners(args);
    }, []);

    const handleDragStart = useCallback((event: DragStartEvent) => {
        setActiveId(String(event.active.id));
    }, []);

    // Cross-container channel hover: move the dragged id in local state so
    // the destination's SortableContext picks it up and animates siblings.
    const handleDragOver = useCallback(
        (event: DragOverEvent) => {
            const { active, over } = event;
            if (!over) return;
            const aId = String(active.id);
            const oId = String(over.id);
            if (!aId.startsWith('ch-')) return;

            const aCat = findCat(aId);
            const oCat = findCat(oId);
            if (aCat === null || oCat === null || aCat === oCat) return;

            setOverride((prev) => {
                const next = { ...(prev ?? baseByCat) };
                const chId = Number(aId.slice(3));
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
        },
        [findCat, baseByCat]
    );

    const handleDragEnd = useCallback(
        async (event: DragEndEvent) => {
            const { active, over } = event;
            setActiveId(null);
            if (!over) {
                setOverride(null);
                return;
            }

            const aId = String(active.id);
            const oId = String(over.id);
            const trpc = getTRPCClient();

            // Voice-member drag: drop onto a different voice channel to move
            // them. `over` resolves to the channel's sortable (ch-) since voice
            // users aren't droppable. ACL is enforced server-side.
            if (aId.startsWith('vu-')) {
                setOverride(null);
                if (!oId.startsWith('ch-')) return;

                const userId = Number(
                    active.data.current?.userId ?? aId.slice(3)
                );
                const sourceChannelId = active.data.current?.channelId as
                    | number
                    | undefined;
                const destChannelId = Number(oId.slice(3));

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

            if (aId.startsWith('cat-')) {
                setOverride(null);
                // closestCorners can resolve `over` to any droppable inside
                // the target category (ch-N, drop-cat-N), not just cat-N.
                // Map back to the owning category before computing indexes.
                const activeCatId = Number(aId.slice(4));
                const overCatId = findCat(oId);
                if (overCatId === null || activeCatId === overCatId) return;
                const oldIdx = categorySortableIds.indexOf(aId);
                const newIdx = categorySortableIds.indexOf(`cat-${overCatId}`);
                if (oldIdx === -1 || newIdx === -1) return;
                const reordered = categorySortableIds.map((s) =>
                    Number(s.slice(4))
                );
                const [moved] = reordered.splice(oldIdx, 1);
                reordered.splice(newIdx, 0, moved);
                try {
                    await trpc.categories.reorder.mutate({
                        categoryIds: reordered
                    });
                } catch (e) {
                    toast.error(
                        getTrpcError(e, 'Failed to reorder categories')
                    );
                }
                return;
            }

            if (!aId.startsWith('ch-')) {
                setOverride(null);
                return;
            }

            const chId = Number(aId.slice(3));
            const oCat = findCat(oId);
            // Source must be looked up in BASE (redux) — `byCat` already
            // reflects the onDragOver-driven optimistic move.
            let sCat: number | null = null;
            for (const k in baseByCat) {
                if (baseByCat[Number(k)].includes(chId)) {
                    sCat = Number(k);
                    break;
                }
            }
            if (oCat === null || sCat === null) {
                setOverride(null);
                return;
            }

            // Final destination order: byCat already has the channel inserted
            // (from onDragOver for cross-container, or no-op for intra). For
            // intra-container drags we still need an arrayMove if dropped on
            // a specific channel.
            const destIds = [...(byCat[oCat] ?? [])];
            if (oId.startsWith('ch-')) {
                const overChId = Number(oId.slice(3));
                if (!destIds.includes(chId)) destIds.push(chId);
                const aIdx = destIds.indexOf(chId);
                const oIdx = destIds.indexOf(overChId);
                if (aIdx !== -1 && oIdx !== -1 && aIdx !== oIdx) {
                    destIds.splice(aIdx, 1);
                    destIds.splice(oIdx, 0, chId);
                }
            } else if (!destIds.includes(chId)) {
                destIds.push(chId);
            }

            // Persist the post-drop layout so the UI doesn't snap back while
            // the server confirms; the effect above clears it on redux update.
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
        },
        [byCat, baseByCat, categorySortableIds, findCat, channels]
    );

    return (
        <div className="flex-1 overflow-y-auto p-2">
            <DndContext
                sensors={sensors}
                collisionDetection={collisionDetection}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={categorySortableIds}
                    strategy={verticalListSortingStrategy}
                    disabled={!can(Permission.MANAGE_CATEGORIES)}
                >
                    {categories.map((category) => (
                        <Category
                            key={category.id}
                            categoryId={category.id}
                            channelIds={byCat[category.id] ?? []}
                        />
                    ))}
                </SortableContext>
                <DragOverlay>
                    {activeId ? <DragGhost id={activeId} /> : null}
                </DragOverlay>
            </DndContext>
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
// from layout so verticalListSortingStrategy gets a stable neighbor height —
// fixes the categories grow/shrink artifact and gives a clear cursor preview.
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
