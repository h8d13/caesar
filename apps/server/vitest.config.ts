import path from 'path';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  resolve: {
    alias: {
      '@server': path.resolve(import.meta.dirname, './src')
    }
  },
  test: {
    // Order matters: dirs/migrations first, then the db mock, then the
    // lifecycle hooks; setupFiles run in order before each file's imports.
    setupFiles: [
      './src/__tests__/prepare.ts',
      './src/__tests__/mock-db.ts',
      './src/__tests__/setup.ts'
    ],
    globalSetup: ['./src/__tests__/global-teardown.ts'],
    // Tests usually run inside the dev container next to the dev server,
    // which holds the default 40000; the voice suite binds its own port.
    env: { CAESAR_WEBRTC_PORT: '40900' },
    testTimeout: 30000,
    hookTimeout: 30000,
    bail: 0,
    // Parallel forks. Each fork has its own data-test-<poolId> dir + sqlite
    // tempfile + HTTP server via globalThis caches in setup.ts. `isolate:
    // false` keeps the module graph + globalThis warm across files in a
    // fork, so the cached server/sqlite/migration survive (one migrate
    // per fork). maxWorkers caps libuv worker contention (argon2 +
    // fs operations) which was causing intermittent 401s on logins.
    pool: 'forks',
    fileParallelism: true,
    isolate: false,
    maxWorkers: 4
  }
});
