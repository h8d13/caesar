import { afterEach, describe, expect, test, vi } from 'vite-plus/test';
import {
    getLocalStorageItemAsJSON,
    getLocalStorageItemBool,
    LocalStorageKey,
    setLocalStorageItem
} from '../storage';

const memoryStorage = (initial: Record<string, string>) => ({
    getItem: (key: string) => initial[key] ?? null,
    setItem: (key: string, value: string) => {
        initial[key] = value;
    },
    removeItem: (key: string) => {
        delete initial[key];
    }
});

describe('storage helpers', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    test('fall back when site storage is blocked', () => {
        const blocked = () => {
            throw new DOMException('denied', 'SecurityError');
        };

        vi.stubGlobal('localStorage', {
            getItem: blocked,
            setItem: blocked,
            removeItem: blocked
        });

        expect(
            getLocalStorageItemBool(LocalStorageKey.LEFT_SIDEBAR_STATE, true)
        ).toBe(true);
        expect(() =>
            setLocalStorageItem(LocalStorageKey.LEFT_SIDEBAR_STATE, 'x')
        ).not.toThrow();
    });

    test('fall back on corrupt JSON', () => {
        vi.stubGlobal(
            'localStorage',
            memoryStorage({ [LocalStorageKey.CATEGORIES_EXPANDED]: '{oops' })
        );

        expect(
            getLocalStorageItemAsJSON(LocalStorageKey.CATEGORIES_EXPANDED, {})
        ).toEqual({});
    });
});
