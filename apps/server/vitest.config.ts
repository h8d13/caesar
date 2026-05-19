import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@server': path.resolve(__dirname, './src')
    }
  },
  test: {
    // Preserve the bun preload order: dirs/migrations first, then mock the db
    // module, then the global lifecycle hooks. setupFiles run in order before
    // each test file's imports resolve, matching bun's preload semantics.
    setupFiles: [
      './src/__tests__/prepare.ts',
      './src/__tests__/mock-db.ts',
      './src/__tests__/setup.ts'
    ],
    testTimeout: 30000,
    hookTimeout: 30000,
    bail: 0,
    // Each file in its own forked process. libsql's native binding tends to
    // segfault under accumulated load in a long-lived worker; per-file forks
    // contain the blast radius (one bad file doesn't kill the rest of the
    // suite). Files still run sequentially via fileParallelism: false to
    // avoid port + db contention on the shared :9999 HTTP server.
    pool: 'forks',
    fileParallelism: false
  }
});
