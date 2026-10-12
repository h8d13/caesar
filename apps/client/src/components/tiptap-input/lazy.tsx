import { lazy, memo } from 'react';

// The editor stack (tiptap, prosemirror, emoji dataset) is most of the
// channel view's weight; loading it on demand lets the message list paint
// first. Consumers wrap it in Suspense with the fallback below.
const TiptapInput = lazy(() =>
    import('./index').then((m) => ({ default: m.TiptapInput }))
);

// Same footprint as the loaded input (editor box + emoji button), so the
// compose bar doesn't shift when it swaps in.
const TiptapInputFallback = memo(() => (
    <div className="flex flex-1 items-center gap-2 min-w-0">
        <div className="border p-2 rounded w-full min-h-10" />
        <div className="size-9 shrink-0" />
    </div>
));

TiptapInputFallback.displayName = 'TiptapInputFallback';

export { TiptapInput, TiptapInputFallback };
