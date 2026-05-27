import parse from 'html-react-parser';
import { renderMarkdown } from './render-markdown';
import { serializer } from './serializer';
import type { TFoundMedia } from './types';

// The one and only message-content render pipeline: stored content -> HTML
// (marked, via renderMarkdown) -> React nodes with every override applied
// (emoji, mentions, embeds, inline media). Shared by the message list and the
// editor preview, so a preview is byte-for-byte the final render, never an
// approximation. pushMedia defaults to a no-op for callers (like the preview)
// that don't render the attached-media grid.
const renderMessageContent = (
    content: string,
    messageId: number,
    pushMedia: (media: TFoundMedia) => void = () => {}
) =>
    parse(renderMarkdown(content), {
        replace: (domNode) => serializer(domNode, pushMedia, messageId)
    });

export { renderMessageContent };
