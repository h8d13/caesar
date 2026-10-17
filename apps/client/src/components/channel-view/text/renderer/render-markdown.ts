import { linkifyHtml } from '@caesar/shared';
import { marked } from 'marked';

marked.setOptions({
    breaks: true,
    gfm: true
});

/**
 * Converts stored message content to rendered HTML for display.
 *
 * The editor stores plain text wrapped in <p> tags with literal markdown
 * syntax (e.g. `<p># heading</p><p>**bold**</p>`).
 *
 * This function strips the editor HTML wrapper, runs the text through
 * a proper markdown parser, then linkifies any remaining bare URLs.
 *
 * Old messages stored as proper HTML (with <h1>, <strong>, etc.) pass
 * through safely marked preserves existing HTML tags.
 */
const FENCE_LINE = /^\s*(```|~~~)/;

// Enter in the editor starts a new <p>, so code typed line by line arrives
// one paragraph per line. Paragraphs normally join with a blank line, but
// inside a fence that blank line became part of the code (an empty first
// line, every line double-spaced): there they join with a single newline.
const joinParagraphs = (paragraphs: string[]): string => {
    let text = '';
    let inFence = false;

    paragraphs.forEach((paragraph, index) => {
        if (index > 0) text += inFence ? '\n' : '\n\n';

        text += paragraph;

        for (const line of paragraph.split('\n')) {
            if (FENCE_LINE.test(line)) inFence = !inFence;
        }
    });

    return text;
};

const renderMarkdown = (content: string): string => {
    // Convert editor HTML to markdown-like text:
    // - <br> variants → newlines
    // - paragraph boundaries → newlines (see joinParagraphs)
    // - strip remaining <p> tags
    const paragraphs = content
        .replace(/<br\s*(?:class="[^"]*")?\s*\/?>/gi, '\n')
        .split(/<\/p>\s*<p>/i)
        .map((paragraph) => paragraph.replace(/<\/?p>/gi, ''));

    const text = joinParagraphs(paragraphs)
        .replace(/&gt;/g, '>')
        .replace(/&lt;/g, '<')
        .replace(/&amp;/g, '&');

    // Convert markdown → HTML (preserves inline HTML like mentions, emojis)
    const html = marked.parse(text) as string;

    // Catch any bare URLs that marked didn't auto-link
    return linkifyHtml(html);
};

export { renderMarkdown };
