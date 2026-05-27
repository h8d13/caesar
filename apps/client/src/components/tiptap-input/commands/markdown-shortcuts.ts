import { Extension, type Editor, type JSONContent } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';

// The composer stores literal markdown text (see render-markdown.ts), so every
// StarterKit formatting shortcut should emit markdown source, not a ProseMirror
// node/mark. Ctrl+B yields `**text**`, Ctrl+Alt+C yields a ``` fence, etc. —
// nothing pre-transforms in the input.
//
// All inserts use raw text / explicit nodes (never HTML parsing) so wrapping
// e.g. `<div>` stays literal. The mark/node extensions stay enabled so older
// messages that already contain <strong>/<blockquote> still render when edited;
// only newly-typed shortcuts change.

// Inline wrap: **bold**, *italic*, `code`, ~~strike~~, <u>underline</u>.
const wrapInline = (editor: Editor, open: string, close: string): boolean =>
    editor
        .chain()
        .focus()
        .command(({ tr }) => {
            const { from, to, empty } = tr.selection;
            const text = tr.doc.textBetween(from, to, '\n');

            tr.insertText(open + text + close, from, to);

            const inner = from + open.length;
            tr.setSelection(
                empty
                    ? TextSelection.create(tr.doc, inner)
                    : TextSelection.create(tr.doc, inner, inner + text.length)
            );

            return true;
        })
        .run();

// Block quote: prefix the current line with "> ".
const prefixLine = (editor: Editor, prefix: string): boolean =>
    editor
        .chain()
        .focus()
        .command(({ tr }) => {
            const start = tr.selection.$from.start();
            tr.insertText(prefix, start, start);
            return true;
        })
        .run();

// Fenced code block with a language hint: ```lang on its own line around the
// selection, with "lang" pre-selected to overtype (e.g. shell). Real hard
// breaks (not "\n" chars, which a paragraph would collapse) so it renders as a
// proper fence and reads as one in the input.
const LANG_HINT = 'lang';

const codeFence = (editor: Editor): boolean => {
    const { from, to } = editor.state.selection;
    const selected = editor.state.doc.textBetween(from, to, '\n');
    const lines = selected.length ? selected.split('\n') : [''];

    const content: JSONContent[] = [
        { type: 'text', text: '```' + LANG_HINT },
        { type: 'hardBreak' }
    ];
    lines.forEach((line, i) => {
        if (line) content.push({ type: 'text', text: line });
        if (i < lines.length - 1) content.push({ type: 'hardBreak' });
    });
    content.push({ type: 'hardBreak' }, { type: 'text', text: '```' });

    // "lang" sits right after the 3 opening backticks.
    const langFrom = from + 3;

    return editor
        .chain()
        .focus()
        .insertContentAt({ from, to }, content)
        .setTextSelection({ from: langFrom, to: langFrom + LANG_HINT.length })
        .run();
};

const MarkdownShortcuts = Extension.create({
    name: 'markdownShortcuts',
    // beat StarterKit's default mark/node shortcuts (priority 100)
    priority: 1000,
    addKeyboardShortcuts() {
        const shortcuts: Record<
            string,
            (props: { editor: Editor }) => boolean
        > = {
            'Mod-b': ({ editor }) => wrapInline(editor, '**', '**'),
            'Mod-i': ({ editor }) => wrapInline(editor, '*', '*'),
            'Mod-e': ({ editor }) => wrapInline(editor, '`', '`'),
            'Mod-Shift-s': ({ editor }) => wrapInline(editor, '~~', '~~'),
            'Mod-u': ({ editor }) => wrapInline(editor, '<u>', '</u>'),
            'Mod-Shift-b': ({ editor }) => prefixLine(editor, '> '),
            'Mod-Alt-c': ({ editor }) => codeFence(editor)
        };

        // headings: Mod-Alt-1..6 -> "# " .. "###### " (StarterKit's keys)
        for (let level = 1; level <= 6; level++) {
            shortcuts[`Mod-Alt-${level}`] = ({ editor }) =>
                prefixLine(editor, '#'.repeat(level) + ' ');
        }

        return shortcuts;
    }
});

// Exposed so a toolbar (full-screen editor) can run the exact same actions as
// the shortcuts, against the same editor.
export { codeFence, MarkdownShortcuts, prefixLine, wrapInline };
