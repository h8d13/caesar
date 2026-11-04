import { useState } from 'react';

type TDraft<D, T> = { source: D; values: T };

// Editable copy of fetched data, derived during render: edits are stored
// with the data they were made on, so a (re)fetch that returns new data
// drops them and the form shows the server values again.
const useDraft = <D, T>(data: D, toValues: (data: D) => T) => {
    const [draft, setDraft] = useState<TDraft<D, T>>();

    const valuesOf = (d: TDraft<D, T> | undefined) =>
        d && d.source === data ? d.values : toValues(data);

    const update = (fn: (values: T) => T) =>
        setDraft((d) => ({ source: data, values: fn(valuesOf(d)) }));

    return [valuesOf(draft), update] as const;
};

export { useDraft };
