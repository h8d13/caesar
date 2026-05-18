import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { defineConfig } from 'vite';
import manifest from './manifest.json';
import pkg from './package.json';

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
        {
            name: 'inject-app-name',
            transformIndexHtml: (html) =>
                html.replace(/%APP_NAME%/g, manifest.name)
        }
    ],
    assetsInclude: ['**/*.wasm'],
    build: {
        target: 'esnext',
        chunkSizeWarningLimit: 1000,
        sourcemap: process.env.SOURCEMAP ? 'hidden' : false
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
