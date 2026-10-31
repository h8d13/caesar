import {
    serverSliceActions,
    serverSliceReducer,
    type IServerState
} from '@/features/server/slice';
import type { IRootState } from '@/features/store';
import type { TJoinedMessage } from '@caesar/shared';
import { describe, expect, test } from 'vite-plus/test';
import {
    messagesByChannelIdSelector,
    visibleMessagesSelector
} from '../selectors';

const CHANNEL_ID = 1;

// ids double as time: message n was sent at n seconds
const msg = (id: number) =>
    ({
        id,
        channelId: CHANNEL_ID,
        userId: 1,
        content: `m${id}`,
        createdAt: id * 1000,
        files: [],
        reactions: [],
        scVotes: []
    }) as unknown as TJoinedMessage;

const range = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => msg(from + i));

const at = (id: number) => id * 1000;

type TAction = Parameters<typeof serverSliceReducer>[1];

const run = (...actions: TAction[]) =>
    actions.reduce<IServerState>(
        (state, action) => serverSliceReducer(state, action),
        serverSliceReducer(undefined, { type: 'init' })
    );

const ids = (messages: TJoinedMessage[]) => messages.map((m) => m.id);

const view = (state: IServerState) => {
    const root = { server: state } as IRootState;

    return {
        visible: ids(visibleMessagesSelector(root, CHANNEL_ID)),
        all: ids(messagesByChannelIdSelector(root, CHANNEL_ID)),
        newerCursor: state.newerCursorMap[CHANNEL_ID]
    };
};

const add = (messages: TJoinedMessage[]) =>
    serverSliceActions.addMessages({ channelId: CHANNEL_ID, messages });

const jump = (messages: TJoinedMessage[], newerCursor: number | null) =>
    serverSliceActions.setJumpWindow({
        channelId: CHANNEL_ID,
        messages,
        newerCursor
    });

const newer = (
    messages: TJoinedMessage[],
    from: number,
    newerCursor: number | null
) =>
    serverSliceActions.addNewerMessages({
        channelId: CHANNEL_ID,
        messages,
        from,
        newerCursor
    });

// the loaded tail (latest page) is 100..149
const tail = add(range(100, 149));

describe('jump window', () => {
    test('a window short of the tail shows only itself', () => {
        const state = run(tail, jump(range(40, 60), at(60)));

        expect(view(state).visible).toEqual(ids(range(40, 60)));
        expect(view(state).newerCursor).toBe(at(60));
        // the tail is kept (unread checks read it), just not shown
        expect(view(state).all).toEqual([
            ...ids(range(40, 60)),
            ...ids(range(100, 149))
        ]);
    });

    test('a window overlapping the tail merges without detaching', () => {
        const state = run(tail, jump(range(80, 105), at(105)));

        expect(view(state).visible).toEqual(ids(range(80, 149)));
        expect(view(state).newerCursor).toBeUndefined();
    });

    test('a window reaching the newest message is attached', () => {
        const state = run(tail, jump(range(130, 149), null));

        expect(view(state).visible).toEqual(ids(range(100, 149)));
        expect(view(state).newerCursor).toBeUndefined();
    });

    test('live messages while detached stay hidden until reached', () => {
        const live = add([msg(150)]);
        const state = run(tail, jump(range(40, 60), at(60)), live);

        expect(view(state).visible).toEqual(ids(range(40, 60)));
        expect(view(state).all).toContain(150);
    });

    test('newer pages fill toward the tail, then attach', () => {
        const live = add([msg(150)]);
        const detached = run(
            tail,
            jump(range(40, 60), at(60)),
            live,
            newer(range(61, 80), at(60), at(80))
        );

        // still a hole 81..99: nothing past the page is shown
        expect(view(detached).visible).toEqual(ids(range(40, 80)));
        expect(view(detached).newerCursor).toBe(at(80));

        // this page reaches the tail start (100): the hole is closed
        const attached = run(
            tail,
            jump(range(40, 60), at(60)),
            live,
            newer(range(61, 80), at(60), at(80)),
            newer(range(81, 100), at(80), at(100))
        );

        expect(view(attached).visible).toEqual(ids(range(40, 150)));
        expect(view(attached).newerCursor).toBeUndefined();
    });

    test('a last newer page (no cursor) attaches', () => {
        const state = run(
            jump(range(40, 60), at(60)),
            newer(range(61, 70), at(60), null)
        );

        expect(view(state).visible).toEqual(ids(range(40, 70)));
        expect(view(state).newerCursor).toBeUndefined();
    });

    test('a newer page for a window that moved is dropped', () => {
        const state = run(
            tail,
            jump(range(40, 60), at(60)),
            jump(range(10, 20), at(20)),
            newer(range(61, 80), at(60), at(80))
        );

        expect(view(state).visible).toEqual(ids(range(10, 20)));
        expect(view(state).all).not.toContain(61);
    });

    test('jumping again drops the previous window', () => {
        const state = run(
            tail,
            jump(range(40, 60), at(60)),
            jump(range(10, 20), at(20))
        );

        expect(view(state).all).toEqual([
            ...ids(range(10, 20)),
            ...ids(range(100, 149))
        ]);
    });

    test('dropping the window shows the tail with live messages', () => {
        const state = run(
            tail,
            jump(range(40, 60), at(60)),
            add([msg(150)]),
            serverSliceActions.dropJumpWindow({ channelId: CHANNEL_ID })
        );

        expect(view(state).visible).toEqual(ids(range(100, 150)));
        expect(view(state).newerCursor).toBeUndefined();
    });

    test('clearing the channel clears the window', () => {
        const state = run(
            tail,
            jump(range(40, 60), at(60)),
            serverSliceActions.clearChannelMessages({ channelId: CHANNEL_ID })
        );

        expect(view(state).newerCursor).toBeUndefined();
    });
});
