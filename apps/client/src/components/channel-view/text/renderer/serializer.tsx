import { ensureHljsTheme } from '@/components/hljs-theme';
import {
    audioExtensions,
    imageExtensions,
    videoExtensions
} from '@caesar/shared';
import hljs from 'highlight.js/lib/common';
import { Element, type DOMNode } from 'html-react-parser';
import { ChannelMentionOverride } from '../overrides/channel-mention';
import { LinkOverride } from '../overrides/link';
import { MentionOverride } from '../overrides/mention';
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
    messageId: number
) => {
    try {
        if (domNode instanceof Element && domNode.name === 'pre') {
            const codeChild = domNode.children.find(
                (child): child is Element =>
                    child instanceof Element && child.name === 'code'
            );

            if (codeChild) {
                ensureHljsTheme();
                const codeText = getTextContent(codeChild);
                const langClass = codeChild.attribs?.class || '';
                const langMatch = langClass.match(/language-(\w+)/);
                const language = langMatch?.[1];

                let highlightedHtml: string;
                try {
                    if (language && hljs.getLanguage(language)) {
                        highlightedHtml = hljs.highlight(codeText, {
                            language
                        }).value;
                    } else {
                        highlightedHtml = hljs.highlightAuto(codeText).value;
                    }
                } catch {
                    highlightedHtml = codeText;
                }

                return (
                    <pre className="hljs-pre">
                        <code
                            className={`hljs ${language ? `language-${language}` : ''}`}
                            dangerouslySetInnerHTML={{
                                __html: highlightedHtml
                            }}
                        />
                    </pre>
                );
            }
        }

        if (domNode instanceof Element && domNode.name === 'a') {
            const href = domNode.attribs.href;

            if (!URL.canParse(href)) {
                return null;
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

                return;
            } else if (isVideo) {
                pushMedia({ type: 'video', url: href });

                return;
            } else if (isAudio) {
                pushMedia({ type: 'audio', url: href });

                return;
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
    } catch (error) {
        console.error(
            `Error parsing DOM node for message ID ${messageId}:`,
            error
        );
    }

    return null;
};

export { serializer };
