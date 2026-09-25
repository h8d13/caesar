import { ensureHljsTheme } from '@/components/hljs-theme';
import { memo, useEffect, useState } from 'react';

// highlight.js is loaded on the first code block rendered, not with the app:
// the block shows as plain text until it arrives, then swaps in the markup.
const loadHljs = () =>
    import('highlight.js/lib/common').then((module) => module.default);

type TCodeBlockProps = {
    code: string;
    language?: string;
};

const CodeBlock = memo(({ code, language }: TCodeBlockProps) => {
    const [html, setHtml] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        ensureHljsTheme();

        loadHljs()
            .then((hljs) => {
                if (cancelled) return;

                const result =
                    language && hljs.getLanguage(language)
                        ? hljs.highlight(code, { language })
                        : hljs.highlightAuto(code);

                setHtml(result.value);
            })
            .catch(() => {
                // keep the plain text: never inject unhighlighted code as HTML
            });

        return () => {
            cancelled = true;
        };
    }, [code, language]);

    const className = `hljs ${language ? `language-${language}` : ''}`;

    return (
        <pre className="hljs-pre">
            {html === null ? (
                <code className={className}>{code}</code>
            ) : (
                <code
                    className={className}
                    dangerouslySetInnerHTML={{ __html: html }}
                />
            )}
        </pre>
    );
});

CodeBlock.displayName = 'CodeBlock';

export { CodeBlock };
