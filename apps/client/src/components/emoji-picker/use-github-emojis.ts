import type { EmojiItem } from '@tiptap/extension-emoji';
import { useEffect, useState } from 'react';

// gitHubEmojis ships inside @tiptap/extension-emoji next to the editor
// engine it imports (~1.3 MB together), so a static import would put both
// in the message list's critical path. One shared load for every caller;
// a failed chunk fetch clears it so the next mount retries.
let loaded: EmojiItem[] | undefined;
let pending: Promise<EmojiItem[]> | undefined;

const loadGitHubEmojis = () => {
    pending ??= import('@tiptap/extension-emoji').then(
        (m) => (loaded = m.gitHubEmojis),
        (error: unknown) => {
            pending = undefined;
            throw error;
        }
    );

    return pending;
};

// undefined until the dataset arrives
const useGitHubEmojis = () => {
    const [emojis, setEmojis] = useState(loaded);

    useEffect(() => {
        if (emojis) return;

        let active = true;

        loadGitHubEmojis()
            .then((result) => {
                if (active) setEmojis(result);
            })
            .catch((error) => {
                console.warn('failed to load emoji dataset', error);
            });

        return () => {
            active = false;
        };
    }, [emojis]);

    return emojis;
};

export { useGitHubEmojis };
