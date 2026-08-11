import { Button, Tooltip } from '@caesar/ui';
import { Moon, Sun, SunMoon, type LucideIcon } from 'lucide-react';
import { memo } from 'react';
import { useTheme, type Theme } from './theme-context';

// system stays in the cycle so the OS default is always one click away,
// never a state you can only leave.
const CYCLE: Theme[] = ['system', 'light', 'dark'];

const ICONS: Record<Theme, LucideIcon> = {
    system: SunMoon,
    light: Sun,
    dark: Moon
};

const LABELS: Record<Theme, string> = {
    system: 'System',
    light: 'Light',
    dark: 'Dark'
};

const ThemeToggle = memo(() => {
    const { theme, setTheme } = useTheme();
    // unknown stored value lands on -1, which cycles back to system
    const next = CYCLE[(CYCLE.indexOf(theme) + 1) % CYCLE.length];
    const Icon = ICONS[theme] ?? ICONS.system;

    return (
        <Tooltip
            content={`Theme: ${LABELS[theme]} (switch to ${LABELS[next]})`}
        >
            <Button
                variant="ghost"
                size="sm"
                onClick={() => setTheme(next)}
                className="h-6 px-2 transition-all duration-200 ease-in-out"
            >
                <Icon className="w-4 h-4" />
            </Button>
        </Tooltip>
    );
});

export { ThemeToggle };
