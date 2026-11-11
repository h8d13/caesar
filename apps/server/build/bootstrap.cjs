'use strict';

// SEA main script (sea-config mainFormat defaults to commonjs).
// The real server is the ESM bundle stored as a SEA asset. We write it
// to a sibling file of the working directory and dynamic-import it so:
//   1) top-level await inside the bundle works (data: URLs cant resolve
//      bare specifiers, but a real path can).
//   2) bare specifier resolution finds /app/node_modules/argon2 from cwd.
//
// Since Node 26 the injected main script may only import() built-ins, so
// the import runs from a one-line loader read off disk through
// createRequire, the documented way to load files from a SEA main script.
// The loader is a second SEA asset (written by sea.mjs).
//
// CWD is expected to be the deploy root (Dockerfile sets WORKDIR /app
// where node_modules/argon2 sits beside this binary).
//
// Both files are only written when missing or different from what this
// binary embeds. Dockerfile.prod ships them pre-extracted (root-owned,
// read-only, byte-identical to the embedded assets), so in the image the
// server never writes under /app and nothing there is writable by the
// runtime user. Run bare from a writable directory, the binary extracts
// them as before. writeFileSync replaces the content in place (no
// temp + rename), so a writable file in a read-only directory also works.

const fs = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const sea = require('node:sea');

const bundlePath = path.join(process.cwd(), '.caesar-runtime.mjs');
const loaderPath = path.join(process.cwd(), '.caesar-runtime-loader.cjs');

const readIfPresent = (file) => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
};

// What is imported below is always exactly what the binary embeds: a file
// with any other content is rewritten first, or the boot stops here.
const extract = (file, asset) => {
  const source = sea.getAsset(asset, 'utf8');

  if (readIfPresent(file) === source) return;

  try {
    fs.writeFileSync(file, source);
  } catch (err) {
    console.error(
      `[caesar] fatal during boot: ${file} is missing or differs from this binary and cannot be written (${err.code}).`,
      'Run from a writable directory, or ship the file next to node_modules (see Dockerfile.prod).'
    );
    process.exit(1);
  }
};

extract(bundlePath, 'main.mjs');
extract(loaderPath, 'loader.cjs');

const importFromDisk = createRequire(loaderPath)(loaderPath);

importFromDisk(pathToFileURL(bundlePath).href).catch((err) => {
  console.error('[caesar] fatal during boot:', err);
  process.exit(1);
});
