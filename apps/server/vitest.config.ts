import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@server': path.resolve(__dirname, './src')
    }
  },
  test: {
    // Order matches the original preload chain: dirs/migrations first, then
    // mock the db module, then the global lifecycle hooks. setupFiles run
    // in declaration order before each test file's imports resolve.
    setupFiles: [
      './src/__tests__/prepare.ts',
      './src/__tests__/mock-db.ts',
      './src/__tests__/setup.ts'
    ],
    globalSetup: ['./src/__tests__/global-teardown.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    bail: 0,
    // Parallel forks. Each fork has its own data-test-<poolId> dir + sqlite
    // tempfile + HTTP server via globalThis caches in setup.ts. `isolate:
    // false` keeps the module graph + globalThis warm across files in a
    // fork, so the cached server/sqlite/migration survive (one migrate
    // per fork). maxForks caps libuv worker contention (argon2 +
    // fs operations) which was causing intermittent 401s on logins.
    pool: 'forks',
    fileParallelism: true,
    isolate: false,
    maxWorkers: 4
  }
});
