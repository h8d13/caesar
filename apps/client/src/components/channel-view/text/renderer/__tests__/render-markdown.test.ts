import { describe, expect, test } from 'vite-plus/test';
import { renderMarkdown } from '../render-markdown';

describe('renderMarkdown code fences', () => {
    // Enter in the editor starts a new <p>, so code typed line by line is
    // stored one paragraph per line
    test('no blank line at the top of a fence typed with Enter', () => {
        const html = renderMarkdown(
            '<p>```python</p><p>print("hello world")</p><p>```</p>'
        );

        expect(html).toContain(
            '<code class="language-python">print(&quot;hello world&quot;)\n</code>'
        );
    });

    test('lines inside a fence are not double-spaced', () => {
        const html = renderMarkdown('<p>```</p><p>a</p><p>b</p><p>```</p>');

        expect(html).toContain('<code>a\nb\n</code>');
    });

    test('an empty line inside a fence is kept', () => {
        const html = renderMarkdown(
            '<p>```</p><p>a</p><p></p><p>b</p><p>```</p>'
        );

        expect(html).toContain('<code>a\n\nb\n</code>');
    });

    test('paragraphs outside a fence stay separate', () => {
        const html = renderMarkdown(
            '<p>before</p><p>```</p><p>x</p><p>```</p><p>after</p>'
        );

        expect(html).toContain('<p>before</p>');
        expect(html).toContain('<code>x\n</code>');
        expect(html).toContain('<p>after</p>');
    });
});
