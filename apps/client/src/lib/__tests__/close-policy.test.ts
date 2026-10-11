import { DisconnectCode } from '@caesar/shared';
import { describe, expect, test } from 'vitest';
import { isTransientClose } from '../close-policy';

describe('isTransientClose', () => {
    test.each([1000, 1001, 1005, 1006])(
        'joined socket closed with %i keeps the session',
        (code) => {
            expect(isTransientClose(code, true)).toBe(true);
        }
    );

    test.each([
        DisconnectCode.KICKED,
        DisconnectCode.BANNED,
        DisconnectCode.SESSION_SUPERSEDED,
        DisconnectCode.LOGGED_OUT
    ])('app code %i ends the session', (code) => {
        expect(isTransientClose(code, true)).toBe(false);
    });

    // createContext rejecting a stale token closes before join
    test.each([1000, 1005, 1006])(
        'close %i before join ends the session',
        (code) => {
            expect(isTransientClose(code, false)).toBe(false);
        }
    );
});
