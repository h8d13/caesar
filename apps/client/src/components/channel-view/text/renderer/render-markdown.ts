import { linkifyHtml } from '@caesar/shared';
import { marked } from 'marked';

marked.setOptions({
    breaks: true,
    gfm: true
});

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

// Stored content is editor <p>s with literal markdown (`<p>**bold**</p>`):
// unwrap them, decode &lt;/&gt;/&amp; (escaped tags revive here and are
// handled by sanitizeElement), run marked, then linkify bare URLs. Older
// messages stored as HTML pass through: marked keeps existing tags.
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
