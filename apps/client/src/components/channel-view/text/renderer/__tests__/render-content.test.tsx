// Drives the real render pipeline (renderMarkdown -> html-react-parser ->
// serializer). Overrides that need the app store are stubbed; they only
// matter for links / mentions, not for which raw tags reach the DOM.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vite-plus/test';
import { AudioOverride } from '../../overrides/audio';
import { ImageOverride } from '../../overrides/image';
import { VideoOverride } from '../../overrides/video';
import { renderMessageContent } from '../render-content';
import type { TFoundMedia } from '../types';

vi.mock('@/components/hljs-theme', () => ({ ensureHljsTheme: () => {} }));
// the real one grabs its portal root from document at import time
vi.mock('@/components/fullscreen-image/content', () => ({
    FullScreenImage: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
        <img {...props} />
    )
}));
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

const MEDIA_OVERRIDES = {
    image: ImageOverride,
    video: VideoOverride,
    audio: AudioOverride
};

// body plus the media grid MessageRenderer builds from pushMedia
const renderWithMedia = (content: string) => {
    const found: TFoundMedia[] = [];
    const body = renderMessageContent(content, 1, (media) => found.push(media));

    return renderToStaticMarkup(
        <>
            {body}
            {found.map((media, index) => {
                const Override = MEDIA_OVERRIDES[media.type];

                return <Override key={index} src={media.url} />;
            })}
        </>
    );
};

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

    test('links with a disallowed scheme lose their href', () => {
        for (const href of [
            'javascript:alert(1)',
            'ms-msdt:/id x',
            'vscode://x/y',
            'data:text/html,x'
        ]) {
            const html = render(`<p><a href="${href}">open report</a></p>`);

            expect(html).toContain('open report');
            expect(html).not.toMatch(/javascript:|ms-msdt:|vscode:|data:/);
        }
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

// a src the browser would fetch from somewhere other than this server
const OFF_ORIGIN_SRC = /\b(src|srcset|poster)="(?!\/(?!\/))[^"]*"/;
const PROXIED = 'src="/proxy/image?url=https%3A%2F%2Ftracker.example%2F';

describe('off-origin media never loads from the viewer', () => {
    test('a raw off-origin <img> is fetched through the image proxy', () => {
        const html = renderWithMedia(
            '<p>look <img src="https://tracker.example/pixel.png?u=1" alt="x"></p>'
        );

        expect(html).not.toMatch(OFF_ORIGIN_SRC);
        expect(html).toContain(`${PROXIED}pixel.png%3Fu%3D1"`);
    });

    test('a protocol-relative <img> is proxied too', () => {
        const html = renderWithMedia(
            '<p><img src="//tracker.example/pixel.png"></p>'
        );

        expect(html).not.toMatch(OFF_ORIGIN_SRC);
        expect(html).toContain(`${PROXIED}pixel.png"`);
    });

    test('a markdown image is proxied', () => {
        const html = renderWithMedia(
            '<p>![alt](https://tracker.example/pixel.png)</p>'
        );

        expect(html).not.toMatch(OFF_ORIGIN_SRC);
        expect(html).toContain(`${PROXIED}pixel.png"`);
    });

    test('an image-extension link embeds through the proxy', () => {
        const html = renderWithMedia(
            '<p><a href="https://tracker.example/photo.png">photo</a></p>'
        );

        expect(html).not.toMatch(OFF_ORIGIN_SRC);
        expect(html).toContain(`${PROXIED}photo.png"`);
    });

    test('a bare image URL embeds through the proxy', () => {
        const html = renderWithMedia(
            '<p>https://tracker.example/photo.png</p>'
        );

        expect(html).not.toMatch(OFF_ORIGIN_SRC);
        expect(html).toContain(`${PROXIED}photo.png"`);
    });

    test('video and audio extension links are not turned into players', () => {
        const html = renderWithMedia(
            '<p><a href="https://tracker.example/clip.mp4">clip</a> ' +
                '<a href="https://tracker.example/song.mp3">song</a></p>'
        );

        // the CSP refuses off-origin media; the plain link stays
        expect(html).not.toMatch(/<(video|audio)\b/);
        expect(html).not.toMatch(OFF_ORIGIN_SRC);
    });

    test('a host that only looks like giphy is proxied', () => {
        const html = renderWithMedia(
            '<p><a href="https://media.giphy.com.tracker.example/a.gif">gif</a> ' +
                '<img src="https://giphy.com@tracker.example/b.gif"></p>'
        );

        expect(html).not.toMatch(OFF_ORIGIN_SRC);
    });

    test('a same-origin upload still renders an <img>', () => {
        const html = renderWithMedia(
            '<p><img src="/public/x.png" class="emoji-image"></p>'
        );

        expect(html).toContain('<img src="/public/x.png"');
        expect(html).toContain('class="emoji-image"');
    });

    test('a giphy link still renders an <img>', () => {
        const html = renderWithMedia(
            '<p><a href="https://media1.giphy.com/media/abc123/giphy.gif">gif</a></p>'
        );

        expect(html).toContain(
            '<img src="https://media1.giphy.com/media/abc123/giphy.webp"'
        );
    });

    test('a built-in emoji image still renders an <img>', () => {
        const html = renderWithMedia(
            '<p><img src="https://github.githubassets.com/images/icons/emoji/atom.png" class="emoji-image"></p>'
        );

        expect(html).toContain('<img src="https://github.githubassets.com/');
    });
});
