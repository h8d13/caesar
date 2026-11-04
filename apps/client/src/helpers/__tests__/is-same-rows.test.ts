import { createNextState } from '@reduxjs/toolkit';
import { describe, expect, test } from 'vite-plus/test';
import { isSameRows } from '../is-same-rows';

describe('isSameRows', () => {
    // optional field: rows of one type may still differ in key set
    type TBet = { userId: number; amount: number; cashedOutAt?: number | null };
    const bet: TBet = { userId: 1, amount: 10, cashedOutAt: null };

    test('equal rows in fresh arrays match', () => {
        expect(isSameRows([bet], [{ ...bet }])).toBe(true);
        expect(isSameRows([], [])).toBe(true);
    });

    test('a changed field, length or key set differs', () => {
        expect(isSameRows([bet], [{ ...bet, cashedOutAt: 1.5 }])).toBe(false);
        expect(isSameRows([bet], [bet, bet])).toBe(false);
        expect(isSameRows([bet], [{ userId: 1, amount: 10 }])).toBe(false);
    });

    test('a draft compares by its base rows', () => {
        createNextState({ bets: [bet] }, (draft) => {
            expect(isSameRows(draft.bets, [{ ...bet }])).toBe(true);
            expect(isSameRows(draft.bets, [{ ...bet, amount: 5 }])).toBe(false);
        });
    });
});
