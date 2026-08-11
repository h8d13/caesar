import {
    getLocalStorageItem,
    LocalStorageKey,
    setLocalStorageItem
} from '@/helpers/storage';
import { useEffect, useState } from 'react';
import { ThemeProviderContext, type Theme } from './theme-context';

type ThemeProviderProps = {
    children: React.ReactNode;
    defaultTheme?: Theme;
    storageKey?: LocalStorageKey;
};

function ThemeProvider({
    children,
    defaultTheme = 'system',
    storageKey = LocalStorageKey.VITE_UI_THEME,
    ...props
}: ThemeProviderProps) {
    const [theme, setTheme] = useState<Theme>(
        () => (getLocalStorageItem(storageKey) as Theme) || defaultTheme
    );

    useEffect(() => {
        const root = window.document.documentElement;

        const apply = (value: 'light' | 'dark') => {
            root.classList.remove('light', 'dark');
            root.classList.add(value);
        };

        if (theme === 'system') {
            const media = window.matchMedia('(prefers-color-scheme: dark)');
            // track OS theme flips live, not just at mount
            const applySystem = () => apply(media.matches ? 'dark' : 'light');

            applySystem();
            media.addEventListener('change', applySystem);
            return () => media.removeEventListener('change', applySystem);
        }

        apply(theme);
    }, [theme]);

    const value = {
        theme,
        setTheme: (theme: Theme) => {
            setLocalStorageItem(storageKey, theme);
            setTheme(theme);
        }
    };

    return (
        <ThemeProviderContext.Provider {...props} value={value}>
            {children}
        </ThemeProviderContext.Provider>
    );
}

export { ThemeProvider };
