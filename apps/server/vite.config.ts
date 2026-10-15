import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite-plus';

// `vp pack` bundles the server into dist/server.mjs, which build/sea.mjs
// embeds in the SEA binary. package.json `dependencies` are exactly the
// packages that stay on disk as /app/node_modules at runtime (native
// bindings or spawned workers: argon2, mediasoup, @libsql/client); every
// devDependency the source imports is bundled.

const { dependencies } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8')
) as { dependencies: Record<string, string> };

const isProduction = process.env.NODE_ENV === 'production';

// set in the Docker builder stage; local builds fall back to the git sha.
// Every tool loading this config (knip, vitest) runs the probe, so a
// missing git stays quiet and resolves to 'dev'.
const buildVersion =
  process.env.CAESAR_BUILD_VERSION ||
  (() => {
    try {
      return execSync('git rev-parse --short HEAD', {
        stdio: ['ignore', 'pipe', 'ignore']
      })
        .toString()
        .trim();
    } catch {
      return 'dev';
    }
  })();

export default defineConfig({
  pack: {
    entry: { server: 'src/index.ts' },
    format: 'esm',
    platform: 'node',
    target: 'node26',
    dts: false,
    shims: true,
    minify: isProduction,
    // prod keeps the map out of the bundle the SEA embeds
    sourcemap: isProduction ? true : 'inline',
    env: { CAESAR_BUILD_VERSION: buildVersion },
    // fails the build if the bundle would import anything else at runtime
    deps: { onlyImport: Object.keys(dependencies) }
  }
});
