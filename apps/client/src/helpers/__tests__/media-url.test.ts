import { describe, expect, test } from 'vite-plus/test';
import { isTrustedMediaUrl, toImageSrc } from '../media-url';

describe('isTrustedMediaUrl', () => {
    test('relative URLs on this server are trusted', () => {
        expect(isTrustedMediaUrl('/public/a.png')).toBe(true);
        expect(isTrustedMediaUrl('public/a.png?accessToken=x')).toBe(true);
    });

    test('URLs that leave this server are not trusted', () => {
        for (const url of [
            'https://tracker.example/a.png',
            'http://tracker.example/a.png',
            '//tracker.example/a.png',
            '/\\tracker.example/a.png',
            'data:image/png;base64,AAAA'
        ]) {
            expect(isTrustedMediaUrl(url), url).toBe(false);
        }
    });

    test('giphy hosts are trusted over https only', () => {
        expect(
            isTrustedMediaUrl('https://media2.giphy.com/media/a/b.gif')
        ).toBe(true);
        // the apex serves pages, not media, and the CSP only allows *.giphy.com
        expect(isTrustedMediaUrl('https://giphy.com/a.gif')).toBe(false);
        expect(isTrustedMediaUrl('http://media.giphy.com/a.gif')).toBe(false);
    });

    test('giphy lookalikes are not trusted', () => {
        for (const url of [
            'https://giphy.com.tracker.example/a.gif',
            'https://notgiphy.com/a.gif',
            'https://media.giphy.com@tracker.example/a.gif',
            'https://tracker.example/media.giphy.com/a.gif'
        ]) {
            expect(isTrustedMediaUrl(url), url).toBe(false);
        }
    });

    test('built-in emoji images are trusted, the rest of their CDN is not', () => {
        expect(
            isTrustedMediaUrl(
                'https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f600.png'
            )
        ).toBe(true);
        expect(
            isTrustedMediaUrl(
                'https://cdn.jsdelivr.net/npm/emoji-datasource-apple/../some-package/a.png'
            )
        ).toBe(false);
        expect(
            isTrustedMediaUrl('https://cdn.jsdelivr.net/gh/someone/repo/a.png')
        ).toBe(false);
    });
});

describe('toImageSrc', () => {
    test('same-origin, giphy and built-in emoji URLs are left alone', () => {
        for (const url of [
            '/public/a.png',
            'https://media2.giphy.com/media/a/b.gif',
            'https://github.githubassets.com/images/icons/emoji/atom.png'
        ]) {
            expect(toImageSrc(url)).toBe(url);
        }
    });

    test('an off-origin image goes through the server proxy', () => {
        expect(toImageSrc('https://tracker.example/a.png?u=1&v=2')).toBe(
            '/proxy/image?url=https%3A%2F%2Ftracker.example%2Fa.png%3Fu%3D1%26v%3D2'
        );
    });

    test('a protocol-relative URL is proxied as an absolute one', () => {
        expect(toImageSrc('//tracker.example/a.png')).toBe(
            '/proxy/image?url=https%3A%2F%2Ftracker.example%2Fa.png'
        );
    });

    test('giphy lookalikes are proxied', () => {
        expect(toImageSrc('https://giphy.com.tracker.example/a.gif')).toMatch(
            /^\/proxy\/image\?url=/
        );
    });

    test('non-http schemes are not turned into proxy requests', () => {
        expect(toImageSrc('data:image/png;base64,AAAA')).toBe(
            'data:image/png;base64,AAAA'
        );
    });
});
