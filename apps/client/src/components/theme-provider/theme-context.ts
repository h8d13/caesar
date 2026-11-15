import { createContext, useContext } from 'react';

type Theme = 'dark' | 'light';

type ThemeProviderState = {
    theme: Theme;
    setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = {
    theme: 'dark',
    setTheme: () => null
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

const useTheme = () => useContext(ThemeProviderContext);

export { ThemeProviderContext, useTheme };
export type { Theme };
