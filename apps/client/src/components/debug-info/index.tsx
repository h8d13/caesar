import { useStrictEffect } from '@/hooks/use-strict-effect';
import { memo } from 'react';

const DebugInfo = memo(() => {
    useStrictEffect(() => {
        console.log(
            '%c CAESAR ',
            `
            font: 900 64px/1 ui-sans-serif, system-ui, -apple-system, sans-serif;
            letter-spacing: 8px;
            padding: 16px 28px;

            color: #fff;
            background:
                radial-gradient(circle, #2a2a2a 30%, transparent 31%) 0 0 / 8px 8px,
                #000;

            text-shadow: 0 2px 0 #000;
            `
        );
        console.log(
            '%cEnvironment: %s',
            'font-size: 16px; font-weight: bold;',
            import.meta.env.MODE
        );
        console.log(
            `%cThis is a open source project, feel free to contribute: ${VITE_APP_REPO_URL}`,
            'font-size: 12px; font-weight: bold;'
        );
        console.log(
            '%cDO NOT PASTE ANY CODE HERE, THIS IS A BROWSER TOOL INTENDED FOR DEV USE ONLY.',
            'font-size: 12px; font-weight: bold; color: red; background: yellow; padding: 10px;'
        );
    }, []);

    return null;
});

export { DebugInfo };
