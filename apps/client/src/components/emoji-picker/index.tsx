import type { TEmojiItem } from '@/components/tiptap-input/helpers';
import { Popover, PopoverContent, PopoverTrigger, Spinner } from '@caesar/ui';
import { lazy, memo, Suspense, useCallback, useState } from 'react';

// The panel carries the emoji dataset (~600 KB with the tiptap module it
// ships in); every message's action bar renders this trigger, so only the
// first open pays for it.
const EmojiPickerPanel = lazy(() =>
    import('./picker-panel').then((m) => ({ default: m.EmojiPickerPanel }))
);

type TEmojiPickerProps = {
    children: React.ReactNode;
    onEmojiSelect: (emoji: TEmojiItem) => void;
    // When set, a GIFs tab appears; selecting a GIF calls back with the
    // media URL (reaction pickers stay emoji-only by omitting it).
    onGifSelect?: (url: string) => void;
    defaultTab?: 'native' | 'custom';
};

const EmojiPicker = memo(
    ({
        children,
        onEmojiSelect,
        onGifSelect,
        defaultTab = 'native'
    }: TEmojiPickerProps) => {
        const [open, setOpen] = useState(false);

        const onClose = useCallback(() => setOpen(false), []);

        return (
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>{children}</PopoverTrigger>
                <PopoverContent
                    className="w-[320px] p-0 h-100 overflow-hidden"
                    align="start"
                    sideOffset={8}
                >
                    <Suspense
                        fallback={
                            <div className="h-full flex items-center justify-center">
                                <Spinner size="xxs" />
                            </div>
                        }
                    >
                        <EmojiPickerPanel
                            onEmojiSelect={onEmojiSelect}
                            onGifSelect={onGifSelect}
                            defaultTab={defaultTab}
                            onClose={onClose}
                        />
                    </Suspense>
                </PopoverContent>
            </Popover>
        );
    }
);

EmojiPicker.displayName = 'EmojiPicker';

export { EmojiPicker };
