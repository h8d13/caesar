import { Toaster, TooltipProvider } from '@caesar/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setDefaultOptions } from 'date-fns';
import { enGB } from 'date-fns/locale';
import 'prosemirror-view/style/prosemirror.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { DebugInfo } from './components/debug-info/index.tsx';
import { StoreDebug } from './components/debug/store-debug.tsx';
import { DevicesProvider } from './components/devices-provider/index.tsx';
import { DialogsProvider } from './components/dialogs/index.tsx';
import { E2eeKeyRegister } from './components/e2ee-key-register.tsx';
import { AutoLoginController } from './components/routing/auto-login-controller.tsx';
import { Routing } from './components/routing/index.tsx';
import { ServerScreensProvider } from './components/server-screens/index.tsx';
import { ThemeProvider } from './components/theme-provider/index.tsx';
import { store } from './features/store.ts';
import { LocalStorageKey } from './helpers/storage.ts';
import './index.css';
import { registerServiceWorker } from './lib/push.ts';

registerServiceWorker();

// every date-fns P/p token app-wide renders european order + 24h clock
// (24/05/2026, 16:26) instead of the en-US default (5/24/2026, 4:26 PM)
setDefaultOptions({ locale: enGB });

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false
        }
    }
});

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <ThemeProvider
                defaultTheme="system"
                storageKey={LocalStorageKey.VITE_UI_THEME}
            >
                <DebugInfo />
                <Provider store={store}>
                    {/* Toaster must live INSIDE Provider so custom toast
                        content (e.g., DmIncomingCall) can call useSelector
                        without hitting a null Redux context. */}
                    <Toaster />
                    <StoreDebug />
                    {/* Single TooltipProvider for the whole app. Tooltip /
                        TooltipRoot no longer instantiate their own. */}
                    <TooltipProvider delayDuration={200}>
                        <DevicesProvider>
                            <DialogsProvider />
                            <ServerScreensProvider />
                            <AutoLoginController />
                            <E2eeKeyRegister />
                            <Routing />
                        </DevicesProvider>
                    </TooltipProvider>
                </Provider>
            </ThemeProvider>
        </QueryClientProvider>
    </StrictMode>
);
