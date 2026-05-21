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
    setupFiles: ['./src/__tests__/mock-db.ts', './src/__tests__/setup.ts'],
    globalSetup: ['./src/__tests__/global-teardown.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    bail: 0,
    // Parallel forks. Each fork mints its own tempfile sqlite + HTTP server
    // via PID-keyed globalThis caches in setup.ts, so files within a fork
    // share that state while forks remain isolated from each other.
    // `isolate: false` keeps the module graph + globalThis warm across
    // files in the same fork (one migrate per fork, not per file).
    pool: 'forks',
    fileParallelism: true,
    isolate: false
  }
});
