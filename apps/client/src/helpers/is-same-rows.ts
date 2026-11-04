// Game state updates resend whole lists of flat rows on every tick.
// Reducers assign the new copy only when a row really changed, so
// selector subscribers keep the old reference and bail.
export const isSameRows = <T extends object>(a: T[], b: T[]) =>
    a.length === b.length &&
    a.every((row, i) => {
        const other = b[i] as Record<string, unknown>;
        const keys = Object.keys(row);

        return (
            keys.length === Object.keys(other).length &&
            keys.every((k) =>
                Object.is((row as Record<string, unknown>)[k], other[k])
            )
        );
    });
