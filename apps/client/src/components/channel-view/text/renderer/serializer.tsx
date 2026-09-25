import {
    audioExtensions,
    imageExtensions,
    videoExtensions
} from '@caesar/shared';
import {
    Element,
    type DOMNode,
    type HTMLReactParserOptions
} from 'html-react-parser';
import { ChannelMentionOverride } from '../overrides/channel-mention';
import { LinkOverride } from '../overrides/link';
import { MentionOverride } from '../overrides/mention';
import { CodeBlock } from './code-block';
import { sanitizeElement } from './sanitize-element';
import type { TFoundMedia } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getTextContent = (node: any): string => {
    if (node.type === 'text') return node.data || '';
    if (node.children) {
        return (
            node.children
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .map((child: any) => getTextContent(child))
                .join('')
        );
    }
    return '';
};

const serializer = (
    domNode: DOMNode,
    pushMedia: (media: TFoundMedia) => void,
    messageId: number,
    options: HTMLReactParserOptions
) => {
    try {
        if (domNode instanceof Element && domNode.name === 'pre') {
            const codeChild = domNode.children.find(
                (child): child is Element =>
                    child instanceof Element && child.name === 'code'
            );

            if (codeChild) {
                const langClass = codeChild.attribs?.class || '';
                const language = langClass.match(/language-(\w+)/)?.[1];

                return (
                    <CodeBlock
                        code={getTextContent(codeChild)}
                        language={language}
                    />
                );
            }
        }

        if (domNode instanceof Element && domNode.name === 'a') {
            const href = domNode.attribs.href;

            if (!URL.canParse(href)) {
                return sanitizeElement(domNode, options);
            }

            const url = new URL(href);
            const urlPath = url.pathname;
            const isImage = imageExtensions.some((ext) =>
                urlPath.endsWith(ext)
            );
            const isVideo = videoExtensions.some((ext) =>
                urlPath.endsWith(ext)
            );
            const isAudio = audioExtensions.some((ext) =>
                urlPath.endsWith(ext)
            );

            if (isImage) {
                pushMedia({ type: 'image', url: href });

                return sanitizeElement(domNode, options);
            } else if (isVideo) {
                pushMedia({ type: 'video', url: href });

                return sanitizeElement(domNode, options);
            } else if (isAudio) {
                pushMedia({ type: 'audio', url: href });

                return sanitizeElement(domNode, options);
            } else {
                const label = getTextContent(domNode);
                return <LinkOverride link={href} label={label || undefined} />;
            }
        } else if (
            domNode instanceof Element &&
            domNode.name === 'span' &&
            domNode.attribs['data-type'] === 'mention' &&
            domNode.attribs['data-user-id']
        ) {
            const userId = parseInt(domNode.attribs['data-user-id'], 10);
            if (!Number.isNaN(userId)) {
                return <MentionOverride userId={userId} />;
            }
        } else if (
            domNode instanceof Element &&
            domNode.name === 'span' &&
            domNode.attribs['data-type'] === 'channel-mention' &&
            domNode.attribs['data-channel-id']
        ) {
            const channelId = parseInt(domNode.attribs['data-channel-id'], 10);
            if (!Number.isNaN(channelId)) {
                return (
                    <ChannelMentionOverride
                        channelId={channelId}
                        channelType={domNode.attribs['data-channel-type']}
                    />
                );
            }
        }

        // everything no override claimed goes through the allowlist
        if (domNode instanceof Element) {
            return sanitizeElement(domNode, options);
        }
    } catch (error) {
        console.error(
            `Error parsing DOM node for message ID ${messageId}:`,
            error
        );

        // fail closed: a node that broke an override is not rendered raw
        return <></>;
    }

    // text nodes keep the parser's default (escaped) rendering
    return null;
};

export { serializer };
