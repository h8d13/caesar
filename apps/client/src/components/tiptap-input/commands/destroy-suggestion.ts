import { type ReactRenderer } from '@tiptap/react';

// Tear down a Tiptap suggestion popover: unmount the DOM node if still
// attached, destroy the renderer, hand back `null` so the caller can
// reassign in one expression (`component = destroySuggestion(component)`).
const destroySuggestion = (component: ReactRenderer | null): null => {
    if (component?.element && document.body.contains(component.element)) {
        document.body.removeChild(component.element);
    }
    component?.destroy();
    return null;
};

export { destroySuggestion };
