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
    // Single-process, shared module cache. Closest to `bun test` semantics:
    // mediasoup/http/db init runs once across files, not per-fork. The old
    // libsql segfault that motivated per-file forks was a Bun-runtime
    // problem; under Node the native binding is stable enough for in-process
    // reuse. If a libsql crash recurs, fall back to pool: 'forks'.
    pool: 'threads',
    fileParallelism: false,
    isolate: false
  }
});
