// Drives the real render pipeline (renderMarkdown -> html-react-parser ->
// serializer). Overrides that need the app store are stubbed; they only
// matter for links / mentions, not for which raw tags reach the DOM.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';
import { renderMessageContent } from '../render-content';

vi.mock('@/components/hljs-theme', () => ({ ensureHljsTheme: () => {} }));
vi.mock('../../overrides/link', () => ({
    LinkOverride: ({ link }: { link: string }) => <a href={link}>{link}</a>
}));
vi.mock('../../overrides/mention', () => ({
    MentionOverride: () => <span>@mention</span>
}));
vi.mock('../../overrides/channel-mention', () => ({
    ChannelMentionOverride: () => <span>#channel</span>
}));

const render = (content: string) =>
    renderToStaticMarkup(<>{renderMessageContent(content, 1)}</>);

describe('message render allowlist', () => {
    test('entity-escaped tags stored by the server stay inert', () => {
        // what sanitize-html stores when a user types these tags as text
        const html = render(
            '<p>&lt;style&gt;body{display:none}&lt;/style&gt;' +
                '&lt;meta http-equiv=refresh content=0;url=https://x&gt;' +
                '&lt;form action=https://x&gt;&lt;button&gt;go&lt;/button&gt;&lt;/form&gt;</p>'
        );

        expect(html).not.toMatch(/<style|<meta|<form|<button/);
        expect(html).not.toContain('display:none');
        expect(html).toContain('go');
    });

    test('raw HTML (E2EE plaintext skips the server) is filtered', () => {
        const html = render(
            '<p><img src="x" onerror="alert(1)" class="fixed inset-0 emoji-image">' +
                '<iframe srcdoc="<b>x</b>"></iframe>' +
                '<span class="mention z-50" style="color:red">hi</span></p>'
        );

        expect(html).not.toMatch(/onerror|<iframe|srcdoc|style=/);
        expect(html).toContain('class="emoji-image"');
        expect(html).toContain('class="mention"');
        expect(html).not.toMatch(/inset-0|z-50/);
    });

    test('disallowed URL schemes are stripped', () => {
        const html = render('<p><img src="data:image/svg+xml,x"></p>');

        expect(html).not.toContain('data:');
    });

    test('markdown output survives', () => {
        const html = render(
            '<p>**bold** ~~gone~~</p><p>| a |\n|---|\n| 1 |</p>'
        );

        expect(html).toContain('<strong>bold</strong>');
        expect(html).toContain('<del>gone</del>');
        expect(html).toContain('<table>');
    });
});
