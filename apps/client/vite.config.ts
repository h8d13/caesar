import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import manifest from './manifest.json';
import pkg from './package.json';
import dumpDevMaps from './vite-plugin-dump-dev-maps';

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
        dumpDevMaps({ outDir: '.vite-devmaps' }),
        {
            name: 'inject-app-name',
            transformIndexHtml: (html) =>
                html.replace(/%APP_NAME%/g, manifest.name)
        }
    ],
    server: {
        // Forward HTTP server routes to the Node server on :4991 so dev is same-origin.
        // tRPC WebSocket connects directly to :4991 (no CORS preflight on WS).
        proxy: {
            '/info': 'http://localhost:4991',
            '/healthz': 'http://localhost:4991',
            '/login': 'http://localhost:4991',
            '/upload': 'http://localhost:4991',
            '/public': 'http://localhost:4991'
        }
    },
    assetsInclude: ['**/*.wasm'],
    build: {
        target: 'esnext',
        chunkSizeWarningLimit: 1000
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src')
        }
    },
    define: {
        VITE_APP_NAME: JSON.stringify(manifest.name),
        VITE_APP_VERSION: JSON.stringify(pkg.version),
        VITE_APP_REPO_URL: JSON.stringify(manifest.repository)
    }
});
