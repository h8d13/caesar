import { type Draft, isDraft, original } from '@reduxjs/toolkit';
import { shallowEqual } from 'react-redux';

// Game state updates resend whole lists of flat rows on every tick.
// Reducers assign the new copy only when a row really changed, so
// selector subscribers keep the old reference and bail. A draft is read
// through its base: no Immer proxy per row just to compare.
export const isSameRows = <T extends object>(a: T[], b: T[]) => {
    const base = isDraft(a) ? original<T[]>(a as Draft<T[]>) : a;

    return (
        base.length === b.length &&
        base.every((row, i) => shallowEqual(row, b[i]))
    );
};
