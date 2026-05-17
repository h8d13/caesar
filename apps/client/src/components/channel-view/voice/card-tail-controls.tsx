import { memo, type RefObject } from 'react';
import { FullscreenButton } from './fullscreen-button';
import { PinButton } from './pin-button';

// Trailing pair of controls shared by every voice card: a Fullscreen
// button (always shown) and an optional Pin button. Each card composes
// its own card-specific controls before this tail inside <CardControls>.
type Props = {
    containerRef: RefObject<HTMLDivElement | null>;
    showPinControls?: boolean;
    isPinned?: boolean;
    handlePinToggle?: () => void;
};

const CardTailControls = memo(
    ({ containerRef, showPinControls, isPinned, handlePinToggle }: Props) => (
        <>
            <FullscreenButton containerRef={containerRef} />
            {showPinControls && (
                <PinButton
                    isPinned={isPinned ?? false}
                    handlePinToggle={handlePinToggle ?? (() => {})}
                />
            )}
        </>
    )
);

CardTailControls.displayName = 'CardTailControls';

export { CardTailControls };
