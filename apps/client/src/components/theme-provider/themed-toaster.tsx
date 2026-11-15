import { Toaster } from '@caesar/ui';
import { memo } from 'react';
import { useTheme } from './theme-context';

const ThemedToaster = memo(() => {
    const { theme } = useTheme();

    return <Toaster theme={theme} />;
});

export { ThemedToaster };
