import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

// Dev-only plugin: persists inline sourcemaps from /src/* responses to disk
// so external tools (e.g. heapmap) can read .map files. Vite normally embeds
// dev maps as base64 inline; we sniff `//# sourceMappingURL=data:...` on each
// JS response, decode, and write `<segment>.map` to the output dir.
//
// Caveat: filename collisions (e.g. two `index.tsx`) overwrite. Acceptable
// for ranking allocation hotspots where last-segment matching is the norm.
export default function dumpDevMaps(opts: { outDir: string }): Plugin {
    const outDir = path.resolve(opts.outDir);

    return {
        name: 'dump-dev-maps',
        apply: 'serve',
        configureServer(server) {
            fs.mkdirSync(outDir, { recursive: true });
            server.middlewares.use((req, res, next) => {
                const url = req.url || '';
                // Only intercept app source modules. Skip node_modules, HMR
                // pings, vite internals, asset requests.
                if (!url.startsWith('/src/')) return next();

                const chunks: Buffer[] = [];
                const origWrite = res.write.bind(res);
                const origEnd = res.end.bind(res);

                res.write = function (chunk: unknown, ...rest: unknown[]) {
                    if (chunk) {
                        chunks.push(
                            Buffer.isBuffer(chunk)
                                ? chunk
                                : Buffer.from(chunk as string)
                        );
                    }
                    return (origWrite as (...a: unknown[]) => boolean)(
                        chunk,
                        ...rest
                    );
                } as typeof res.write;

                res.end = function (chunk?: unknown, ...rest: unknown[]) {
                    if (chunk) {
                        chunks.push(
                            Buffer.isBuffer(chunk)
                                ? chunk
                                : Buffer.from(chunk as string)
                        );
                    }
                    const ct = res.getHeader('content-type');
                    if (typeof ct === 'string' && ct.includes('javascript')) {
                        const body = Buffer.concat(chunks).toString('utf8');
                        const m = body.match(
                            /\/\/# sourceMappingURL=data:application\/json[^,]*;base64,([A-Za-z0-9+/=]+)/
                        );
                        if (m) {
                            try {
                                const json = Buffer.from(m[1], 'base64').toString(
                                    'utf8'
                                );
                                const cleanPath = url.split('?')[0];
                                const segment = cleanPath.split('/').pop();
                                if (segment) {
                                    fs.writeFileSync(
                                        path.join(outDir, segment + '.map'),
                                        json
                                    );
                                }
                            } catch {
                                // Bad base64 or unwritable target; non-fatal.
                            }
                        }
                    }
                    return (origEnd as (...a: unknown[]) => typeof res)(
                        chunk,
                        ...rest
                    );
                } as typeof res.end;

                next();
            });
        }
    };
}
