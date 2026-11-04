import { Toaster, TooltipProvider } from '@caesar/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { setDefaultOptions } from 'date-fns';
import { enGB } from 'date-fns/locale';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { StoreDebug } from './components/debug/store-debug.tsx';
import { DevicesProvider } from './components/devices-provider/index.tsx';
import { DialogsProvider } from './components/dialogs/index.tsx';
import { AutoLoginController } from './components/routing/auto-login-controller.tsx';
import { Routing } from './components/routing/index.tsx';
import { ServerScreensProvider } from './components/server-screens/index.tsx';
import { ThemeProvider } from './components/theme-provider/index.tsx';
import { loadApp } from './features/app/pre-auth-actions.ts';
import { store } from './features/store.ts';
import { printConsoleBanner } from './helpers/print-console-banner';
import {
    LocalStorageKey,
    removeLegacySessionTokens
} from './helpers/storage.ts';
import { queryClient } from './lib/query-client.ts';
import { registerServiceWorker } from './lib/service-worker.ts';

removeLegacySessionTokens();
printConsoleBanner();
registerServiceWorker();
// once per page load, before render: tied to the loading screen it re-ran
// (second /info) whenever that screen remounted
void loadApp();

// every date-fns P/p token app-wide renders european order + 24h clock
// (24/05/2026, 16:26) instead of the en-US default (5/24/2026, 4:26 PM)
setDefaultOptions({ locale: enGB });

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <ThemeProvider
                defaultTheme="system"
                storageKey={LocalStorageKey.VITE_UI_THEME}
            >
                <Provider store={store}>
                    {/* Toaster must live INSIDE Provider so custom toast
                        content (e.g., DmIncomingCall) can call useSelector
                        without hitting a null Redux context. */}
                    <Toaster />
                    <StoreDebug />
                    {/* Tooltip/TooltipRoot rely on this single provider */}
                    <TooltipProvider delayDuration={200}>
                        <DevicesProvider>
                            <DialogsProvider />
                            <ServerScreensProvider />
                            <AutoLoginController />
                            <Routing />
                        </DevicesProvider>
                    </TooltipProvider>
                </Provider>
            </ThemeProvider>
        </QueryClientProvider>
    </StrictMode>
);
