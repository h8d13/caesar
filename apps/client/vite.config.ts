import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { defineConfig } from 'vite';
import manifest from './manifest.json';
import pkg from './package.json';

// https://vite.dev/config/
export default defineConfig({
    plugins: [react(), tailwindcss()],
    assetsInclude: ['**/*.wasm'],
    build: {
        target: 'esnext',
        chunkSizeWarningLimit: 1000,
        rollupOptions: {
            output: {
                manualChunks: {
                    'vendor-react': ['react', 'react-dom'],
                    'vendor-redux': [
                        '@reduxjs/toolkit',
                        'react-redux',
                        're-reselect'
                    ],
                    'vendor-tiptap': [
                        '@tiptap/core',
                        '@tiptap/react',
                        '@tiptap/starter-kit',
                        '@tiptap/extension-emoji',
                        '@tiptap/suggestion'
                    ],
                    'vendor-mediasoup': ['mediasoup-client'],
                    'vendor-hljs': ['highlight.js'],
                    'vendor-date': ['date-fns']
                }
            }
        }
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src')
        }
    },
    define: {
        VITE_APP_NAME: JSON.stringify(manifest.name),
        VITE_APP_VERSION: JSON.stringify(pkg.version),
        VITE_GITHUB_URL: JSON.stringify(
            process.env.VITE_GITHUB_URL || 'https://github.com/h8d13/sharkord'
        )
    }
});
