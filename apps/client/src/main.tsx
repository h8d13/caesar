import { Toaster } from '@sharkord/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import 'prosemirror-view/style/prosemirror.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { DebugInfo } from './components/debug-info/index.tsx';
import { StoreDebug } from './components/debug/store-debug.tsx';
import { DevicesProvider } from './components/devices-provider/index.tsx';
import { DialogsProvider } from './components/dialogs/index.tsx';
import { AutoLoginController } from './components/routing/auto-login-controller.tsx';
import { Routing } from './components/routing/index.tsx';
import { ServerScreensProvider } from './components/server-screens/index.tsx';
import { ThemeProvider } from './components/theme-provider/index.tsx';
import { store } from './features/store.ts';
import { LocalStorageKey } from './helpers/storage.ts';
import './index.css';

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
                defaultTheme="dark"
                storageKey={LocalStorageKey.VITE_UI_THEME}
            >
                <DebugInfo />
                <Toaster />
                <Provider store={store}>
                    <StoreDebug />
                    <DevicesProvider>
                        <DialogsProvider />
                        <ServerScreensProvider />
                        <AutoLoginController />
                        <Routing />
                    </DevicesProvider>
                </Provider>
            </ThemeProvider>
        </QueryClientProvider>
    </StrictMode>
);
