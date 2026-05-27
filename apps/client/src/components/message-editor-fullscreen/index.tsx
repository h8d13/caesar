import { renderMessageContent } from '@/components/channel-view/text/renderer/render-content';
import {
    codeFence,
    prefixLine,
    wrapInline
} from '@/components/tiptap-input/commands/markdown-shortcuts';
import { useMessageEditorExtensions } from '@/components/tiptap-input/use-message-editor-extensions';
import { cn } from '@/lib/utils';
import { isEmojiOnlyMessage, type TJoinedPublicUser } from '@caesar/shared';
import { Button } from '@caesar/ui';
import type { Editor } from '@tiptap/react';
import { EditorContent, useEditor } from '@tiptap/react';
import {
    Bold,
    Code,
    Heading1,
    Heading2,
    Heading3,
    Italic,
    Quote,
    SquareCode,
    Strikethrough,
    Underline,
    X
} from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type TMessageEditorFullscreenProps = {
    // stored message content (markdown text + mention/emoji spans, wrapped in
    // the editor's <p>/<br> HTML — the same shape the inline composer emits)
    initialValue: string;
    users?: TJoinedPublicUser[];
    onSave: (html: string) => void;
    onClose: () => void;
};

// Full-screen editor: the SAME tiptap editor as the inline composer (shared
// extensions => @/# mention + emoji + slash autocomplete, and MarkdownShortcuts
// so Ctrl+B inserts `**` etc.), just full height with a toolbar, beside a live
// preview. The preview runs the exact message render pipeline, so it is what
// the sent message becomes. Content is the composer's format throughout — no
// conversion. Save writes back into the composer draft; it does not send.
const MessageEditorFullscreen = memo(
    ({
        initialValue,
        users,
        onSave,
        onClose
    }: TMessageEditorFullscreenProps) => {
        const extensions = useMessageEditorExtensions(users);
        const [html, setHtml] = useState(initialValue);

        // read latest callbacks/editor inside the static editorProps closure
        const onSaveRef = useRef(onSave);
        onSaveRef.current = onSave;
        const onCloseRef = useRef(onClose);
        onCloseRef.current = onClose;
        const editorRef = useRef<Editor | null>(null);

        const editor = useEditor({
            extensions,
            content: initialValue,
            enableInputRules: false,
            enablePasteRules: false,
            autofocus: 'end',
            onUpdate: ({ editor }) => setHtml(editor.getHTML()),
            editorProps: {
                handleKeyDown: (view, event) => {
                    // let an open mention/emoji/command popup take the key
                    const suggestionOpen =
                        !!document.querySelector('.bg-popover');

                    if (event.key === 'Escape') {
                        if (suggestionOpen) return false;
                        event.preventDefault();
                        onCloseRef.current();
                        return true;
                    }

                    // Ctrl+Enter saves (and beats tiptap's Mod-Enter hard break)
                    if (event.key === 'Enter' && event.ctrlKey) {
                        if (suggestionOpen) return false;
                        event.preventDefault();
                        onSaveRef.current(editorRef.current?.getHTML() ?? '');
                        return true;
                    }

                    if (event.key === 'Tab') {
                        event.preventDefault();
                        const { state, dispatch } = view;
                        if (event.shiftKey) {
                            const { $from } = state.selection;
                            const startPos = $from.start();
                            const text = $from.parent.textContent;
                            let count = 0;
                            while (
                                count < 4 &&
                                count < text.length &&
                                text[count] === ' '
                            ) {
                                count++;
                            }
                            if (count > 0) {
                                dispatch(
                                    state.tr.delete(startPos, startPos + count)
                                );
                            }
                        } else {
                            dispatch(state.tr.insertText('    '));
                        }
                        return true;
                    }

                    return false;
                }
            }
        });

        useEffect(() => {
            editorRef.current = editor;
        }, [editor]);

        // exact final render pipeline (markdown + serializer overrides)
        const previewNodes = useMemo(
            () => renderMessageContent(html, -1),
            [html]
        );
        const emojiOnly = useMemo(() => isEmojiOnlyMessage(html), [html]);

        if (!editor) return null;

        // toolbar = the same actions as the shortcuts, on the same editor
        const tools = [
            {
                icon: Heading1,
                label: 'Heading 1 (Ctrl+Alt+1)',
                run: () => prefixLine(editor, '# ')
            },
            {
                icon: Heading2,
                label: 'Heading 2 (Ctrl+Alt+2)',
                run: () => prefixLine(editor, '## ')
            },
            {
                icon: Heading3,
                label: 'Heading 3 (Ctrl+Alt+3)',
                run: () => prefixLine(editor, '### ')
            },
            {
                icon: Bold,
                label: 'Bold (Ctrl+B)',
                run: () => wrapInline(editor, '**', '**')
            },
            {
                icon: Italic,
                label: 'Italic (Ctrl+I)',
                run: () => wrapInline(editor, '*', '*')
            },
            {
                icon: Strikethrough,
                label: 'Strikethrough (Ctrl+Shift+S)',
                run: () => wrapInline(editor, '~~', '~~')
            },
            {
                icon: Code,
                label: 'Inline code (Ctrl+E)',
                run: () => wrapInline(editor, '`', '`')
            },
            {
                icon: Underline,
                label: 'Underline (Ctrl+U)',
                run: () => wrapInline(editor, '<u>', '</u>')
            },
            {
                icon: Quote,
                label: 'Quote (Ctrl+Shift+B)',
                run: () => prefixLine(editor, '> ')
            },
            {
                icon: SquareCode,
                label: 'Code block (Ctrl+Alt+C)',
                run: () => codeFence(editor)
            }
        ];

        // Portal to <body> so the modal is a top-level sibling of the
        // body-appended suggestion popups; otherwise an ancestor stacking
        // context traps its z-index and the @/# popups render behind it.
        return createPortal(
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4">
                <div className="flex h-full max-h-[90vh] w-full max-w-7xl flex-col overflow-hidden rounded-lg border bg-background shadow-xl">
                    <div className="flex items-center gap-0.5 border-b border-border p-2">
                        {tools.map((tool) => (
                            <Button
                                key={tool.label}
                                type="button"
                                variant="ghost"
                                size="icon"
                                title={tool.label}
                                className="h-8 w-8"
                                // keep editor focus/selection so the action
                                // targets the current selection
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={tool.run}
                            >
                                <tool.icon className="h-4 w-4" />
                            </Button>
                        ))}
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            title="Close"
                            className="ml-auto h-8 w-8"
                            onClick={onClose}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>

                    <div className="flex min-h-0 flex-1 flex-col divide-y divide-border md:flex-row md:divide-x md:divide-y-0">
                        <EditorContent
                            editor={editor}
                            className="tiptap min-h-0 flex-1 overflow-auto p-4 [&_.ProseMirror]:min-h-full [&_.ProseMirror:focus]:outline-none"
                        />
                        <div className="min-h-0 flex-1 overflow-auto p-4">
                            <div
                                className={cn(
                                    'prose max-w-full overflow-hidden wrap-break-word msg-content',
                                    emojiOnly && 'emoji-only'
                                )}
                            >
                                {previewNodes}
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 border-t border-border p-2">
                        <Button variant="ghost" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button onClick={() => onSave(editor.getHTML())}>
                            Save
                        </Button>
                    </div>
                </div>
            </div>,
            document.body
        );
    }
);

MessageEditorFullscreen.displayName = 'MessageEditorFullscreen';

export { MessageEditorFullscreen };
