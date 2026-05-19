#!/usr/bin/env node
// Bundle the server into a single ESM file (dist/server.mjs).
// Externals stay on disk as node_modules sidecars at runtime.
// Everything that loads a .node binding or spawns a worker must be
// external; bundled JS cant resolve runtime `require('@scope/native')`.
//   - argon2: native bindings via node-gyp-build.
//   - mediasoup: native worker binary (MEDIASOUP_WORKER_BIN) + flatbuffers.
//   - @libsql/client + libsql: native sqlite bindings under @libsql/*-*.

import { execSync } from 'node:child_process';
import { build } from 'esbuild';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(serverDir, 'dist');

// CAESAR_BUILD_VERSION is set in Docker builder stage (from --build-arg).
// Fall back to the current git short-SHA so local `pnpm build` produces a
// meaningful version too. Final fallback is `dev` for environments without
// git (e.g. tarball-based CI).
const buildVersion =
  process.env.CAESAR_BUILD_VERSION ||
  (() => {
    try {
      return execSync('git rev-parse --short HEAD', { cwd: serverDir })
        .toString()
        .trim();
    } catch {
      return 'dev';
    }
  })();

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

await build({
  entryPoints: [path.join(serverDir, 'src/index.ts')],
  outfile: path.join(distDir, 'server.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: 'inline',
  legalComments: 'none',
  logLevel: 'info',
  external: ['argon2', 'mediasoup', '@libsql/client', 'libsql'],
  tsconfig: path.join(serverDir, 'tsconfig.json'),
  // Bake the build version into the bundle at compile time. Master's bun
  // pipeline relied on `--define` for this; esbuild leaves `process.env.X`
  // alone by default, so without this the runtime sees undefined and
  // falls back to '0.0.0-dev'.
  define: {
    'process.env.CAESAR_BUILD_VERSION': JSON.stringify(buildVersion)
  },
  // ESM bundle in node land needs require shim for any deep CJS deps that
  // call require() at runtime (e.g. drizzle/libsql internals).
  banner: {
    js: [
      "import { createRequire as __caesarCreateRequire } from 'node:module';",
      "import { fileURLToPath as __caesarFileURLToPath } from 'node:url';",
      "import { dirname as __caesarDirname } from 'node:path';",
      'const require = __caesarCreateRequire(import.meta.url);',
      'const __filename = __caesarFileURLToPath(import.meta.url);',
      'const __dirname = __caesarDirname(__filename);'
    ].join('\n')
  }
});

console.log(`Bundle written to ${path.relative(serverDir, path.join(distDir, 'server.mjs'))} (build version: ${buildVersion})`);
