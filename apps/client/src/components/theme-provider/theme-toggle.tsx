import { Button, Tooltip } from '@caesar/ui';
import { Moon, Sun } from 'lucide-react';
import { memo } from 'react';
import { useTheme } from './theme-context';

const ThemeToggle = memo(() => {
    const { theme, setTheme } = useTheme();
    const isDark = theme === 'dark';
    const Icon = isDark ? Moon : Sun;

    return (
        <Tooltip
            content={`Theme: ${isDark ? 'Dark' : 'Light'} (switch to ${isDark ? 'Light' : 'Dark'})`}
        >
            <Button
                variant="ghost"
                size="sm"
                onClick={() => setTheme(isDark ? 'light' : 'dark')}
                className="h-6 px-2 transition-all duration-200 ease-in-out"
            >
                <Icon className="w-4 h-4" />
            </Button>
        </Tooltip>
    );
});

export { ThemeToggle };
