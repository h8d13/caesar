import {
    isAllowedMessageClass,
    MESSAGE_ALLOWED_ATTRIBUTES,
    MESSAGE_ALLOWED_SCHEMES,
    MESSAGE_ALLOWED_TAGS
} from '@caesar/shared';
import {
    attributesToProps,
    domToReact,
    type DOMNode,
    type Element,
    type HTMLReactParserOptions
} from 'html-react-parser';
import { createElement } from 'react';

// marked emits these for GFM on top of what the editor stores
const MARKDOWN_TAGS = ['del', 'table', 'thead', 'tbody', 'tr', 'th', 'td'];

const MARKDOWN_ATTRIBUTES: Record<string, string[]> = {
    a: ['title'],
    img: ['title'],
    ol: ['start'],
    th: ['align'],
    td: ['align']
};

const ALLOWED_TAGS = new Set([...MESSAGE_ALLOWED_TAGS, ...MARKDOWN_TAGS]);

// Dropped with their content (sanitize-html's nonTextTags idea): unwrapping
// them would print raw CSS / script / markup text into the message.
const DROPPED_TAGS = new Set([
    'script',
    'style',
    'textarea',
    'option',
    'select',
    'noscript',
    'title',
    'template',
    'iframe',
    'object',
    'embed',
    'svg',
    'math'
]);

const URL_ATTRIBUTES = new Set(['href', 'src']);

// Relative URLs resolve against a placeholder base: only the scheme matters
// here, and this keeps the check free of window (testable under node).
const URL_BASE = 'https://relative.invalid/';

const isAllowedUrl = (value: string): boolean => {
    try {
        const { protocol } = new URL(value, URL_BASE);
        return MESSAGE_ALLOWED_SCHEMES.includes(protocol.slice(0, -1));
    } catch {
        return false;
    }
};

const filterAttributes = (
    tag: string,
    attribs: Record<string, string>
): Record<string, string> => {
    const allowed = [
        ...(MESSAGE_ALLOWED_ATTRIBUTES[tag] ?? []),
        ...(MARKDOWN_ATTRIBUTES[tag] ?? [])
    ];
    const result: Record<string, string> = {};

    for (const name of allowed) {
        const value = attribs[name];

        if (value === undefined) continue;
        if (URL_ATTRIBUTES.has(name) && !isAllowedUrl(value)) continue;

        if (name === 'class') {
            const classes = value
                .split(/\s+/)
                .filter(isAllowedMessageClass)
                .join(' ');

            if (classes) result.class = classes;
            continue;
        }

        result[name] = value;
    }

    return result;
};

// Render-time allowlist for every element the serializer overrides don't
// claim. The stored HTML was sanitized server-side, but renderMarkdown
// decodes &lt; / &gt; before marked (so typed markdown works), which turns
// escaped text back into live tags. E2EE plaintext never saw the server
// sanitizer at all. Unknown tags are unwrapped so their text survives.
const sanitizeElement = (domNode: Element, options: HTMLReactParserOptions) => {
    const tag = domNode.name;

    if (DROPPED_TAGS.has(tag)) return <></>;

    const children =
        domNode.children.length > 0
            ? domToReact(domNode.children as DOMNode[], options)
            : undefined;

    if (!ALLOWED_TAGS.has(tag)) return <>{children}</>;

    return createElement(
        tag,
        attributesToProps(filterAttributes(tag, domNode.attribs)),
        children
    );
};

export { sanitizeElement };
