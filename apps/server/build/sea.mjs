#!/usr/bin/env node
// Assemble Node SEA executable from dist/server.mjs.
// Linux-only (skips codesign / Windows resource patching).
// Output: dist/caesar (a Node binary with the bundle embedded as an
// asset; bootstrap.cjs extracts and imports it at boot).

import { execFileSync } from 'node:child_process';
import { copyFileSync, chmodSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(serverDir, 'dist');
const bundlePath = path.join(distDir, 'server.mjs');
const bootstrapSrc = path.join(serverDir, 'build/bootstrap.cjs');
const bootstrapDst = path.join(distDir, 'bootstrap.cjs');
const seaConfigPath = path.join(distDir, 'sea-config.json');
const seaBlobPath = path.join(distDir, 'sea-prep.blob');
const binaryPath = path.join(distDir, 'caesar');

if (!existsSync(bundlePath)) {
  console.error(`Bundle not found at ${bundlePath}. Run \`pnpm build\` first.`);
  process.exit(1);
}

copyFileSync(bootstrapSrc, bootstrapDst);

writeFileSync(
  seaConfigPath,
  JSON.stringify(
    {
      main: bootstrapDst,
      output: seaBlobPath,
      disableExperimentalSEAWarning: true,
      useSnapshot: false,
      useCodeCache: true,
      assets: {
        'main.mjs': bundlePath
      }
    },
    null,
    2
  )
);

console.log('Generating SEA blob...');
execFileSync(process.execPath, ['--experimental-sea-config', seaConfigPath], {
  stdio: 'inherit'
});

console.log('Cloning node binary...');
copyFileSync(process.execPath, binaryPath);
chmodSync(binaryPath, 0o755);

console.log('Injecting blob with postject...');
const postjectCli = path.join(serverDir, 'node_modules/postject/dist/cli.js');
execFileSync(
  process.execPath,
  [
    postjectCli,
    binaryPath,
    'NODE_SEA_BLOB',
    seaBlobPath,
    '--sentinel-fuse',
    'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'
  ],
  { stdio: 'inherit' }
);

console.log(`Built ${path.relative(serverDir, binaryPath)}`);
