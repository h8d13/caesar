// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore Vite resolves ?url imports from node_modules
import lightThemeUrl from 'highlight.js/styles/github.min.css?url';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore Vite resolves ?url imports from node_modules
import darkThemeUrl from 'highlight.js/styles/github-dark.min.css?url';

const LINK_ID = 'hljs-theme';

let observing = false;

const getThemeUrl = () => {
    const isDark = document.documentElement.classList.contains('dark');
    return isDark ? darkThemeUrl : lightThemeUrl;
};

const ensureHljsTheme = () => {
    let link = document.getElementById(LINK_ID) as HTMLLinkElement | null;

    if (!link) {
        link = document.createElement('link');
        link.id = LINK_ID;
        link.rel = 'stylesheet';
        link.href = getThemeUrl();
        document.head.appendChild(link);
    }

    if (!observing) {
        observing = true;

        const observer = new MutationObserver(() => {
            const existing = document.getElementById(
                LINK_ID
            ) as HTMLLinkElement | null;
            if (existing) {
                existing.href = getThemeUrl();
            }
        });

        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class']
        });
    }
};

export { ensureHljsTheme };
