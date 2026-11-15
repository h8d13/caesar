import { describe, expect, test, vi } from 'vite-plus/test';
import {
    readErrorBody,
    serverFetch,
    UNREACHABLE_MESSAGE
} from '../server-fetch';

describe('readErrorBody', () => {
    test('returns our JSON error body', async () => {
        const response = new Response(
            JSON.stringify({ errors: { identity: 'Invalid' } }),
            { status: 400 }
        );

        expect(await readErrorBody(response)).toEqual({
            errors: { identity: 'Invalid' }
        });
    });

    test('an empty 502 from the proxy means the server is unreachable', async () => {
        await expect(
            readErrorBody(new Response('', { status: 502 }))
        ).rejects.toThrow(UNREACHABLE_MESSAGE);
    });

    test('a non-JSON client error gives an empty body', async () => {
        expect(
            await readErrorBody(new Response('nope', { status: 429 }))
        ).toEqual({});
    });
});

describe('serverFetch', () => {
    test('a network failure reads as unreachable', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(() => Promise.reject(new TypeError('Failed to fetch')))
        );

        try {
            await expect(serverFetch('/login')).rejects.toThrow(
                UNREACHABLE_MESSAGE
            );
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
