import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import type { Plugin } from 'vite';

// Build-time gzip/brotli for the emitted bundle. The server used to run
// brotli at its default quality 11 on every asset request with no cache,
// which costs ~1.3s of CPU for the largest chunk and produces byte-identical
// output each time. Doing it once here makes q11 free at request time; the
// server falls back to (cheaper) runtime compression for anything without a
// precompressed sibling.
//
// index.html is excluded on purpose: the server injects a fresh CSP nonce
// into it per request, so a precompressed copy would serve stale markup.
const COMPRESSIBLE_EXTENSIONS = new Set([
    '.js',
    '.css',
    '.html',
    '.json',
    '.svg',
    '.txt',
    '.xml'
]);

// Below this, the ~20 bytes of container overhead and the extra file on disk
// are not worth the handful of bytes saved.
const MIN_BYTES = 1024;

const walk = (dir: string): string[] => {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) return walk(full);
        if (!entry.isFile()) return [];

        return [full];
    });
};

export default function precompress(): Plugin {
    let outDir = 'dist';

    return {
        name: 'precompress',
        apply: 'build',
        configResolved(config) {
            outDir = path.resolve(config.root, config.build.outDir);
        },
        closeBundle() {
            if (!fs.existsSync(outDir)) return;

            let saved = 0;
            let count = 0;

            for (const file of walk(outDir)) {
                const ext = path.extname(file);

                if (!COMPRESSIBLE_EXTENSIONS.has(ext)) continue;
                if (path.basename(file) === 'index.html') continue;

                const raw = fs.readFileSync(file);

                if (raw.length < MIN_BYTES) continue;

                const variants: [string, Buffer][] = [
                    [
                        `${file}.br`,
                        zlib.brotliCompressSync(raw, {
                            params: {
                                [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
                                [zlib.constants.BROTLI_PARAM_SIZE_HINT]:
                                    raw.length
                            }
                        })
                    ],
                    [`${file}.gz`, zlib.gzipSync(raw, { level: 9 })]
                ];

                for (const [target, buf] of variants) {
                    // A file that grew is worse than no precompressed copy:
                    // the server would serve the larger variant.
                    if (buf.length >= raw.length) continue;

                    fs.writeFileSync(target, buf);
                    saved += raw.length - buf.length;
                    count++;
                }
            }

            const mb = (n: number) => (n / 1024 / 1024).toFixed(2);

            this.info(
                `precompress: wrote ${count} files, ${mb(saved)} MB saved`
            );
        }
    };
}
