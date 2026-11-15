import {
    getLocalStorageItem,
    LocalStorageKey,
    removeLocalStorageItem,
    setLocalStorageItem
} from '@/helpers/storage';
import { useEffect, useState } from 'react';
import { ThemeProviderContext, type Theme } from './theme-context';

type ThemeProviderProps = {
    children: React.ReactNode;
    storageKey?: LocalStorageKey;
};

function ThemeProvider({
    children,
    storageKey = LocalStorageKey.VITE_UI_THEME,
    ...props
}: ThemeProviderProps) {
    // dark unless light was explicitly chosen: the OS/browser scheme is not
    // consulted, and only 'light' is ever stored (a legacy 'system' or
    // 'dark' value reads as dark)
    const [theme, setTheme] = useState<Theme>(() =>
        getLocalStorageItem(storageKey) === 'light' ? 'light' : 'dark'
    );

    useEffect(() => {
        const root = window.document.documentElement;

        root.classList.remove('light', 'dark');
        root.classList.add(theme);
    }, [theme]);

    const value = {
        theme,
        setTheme: (theme: Theme) => {
            if (theme === 'light') setLocalStorageItem(storageKey, theme);
            else removeLocalStorageItem(storageKey);
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
