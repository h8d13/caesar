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
//
// CWD is expected to be the deploy root (Dockerfile sets WORKDIR /app
// where node_modules/argon2 sits beside this binary).

const fs = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const sea = require('node:sea');

const bundleSrc = sea.getAsset('main.mjs', 'utf8');
const bundlePath = path.join(process.cwd(), '.caesar-runtime.mjs');
const loaderPath = path.join(process.cwd(), '.caesar-runtime-loader.cjs');

fs.writeFileSync(bundlePath, bundleSrc);
fs.writeFileSync(loaderPath, 'module.exports = (url) => import(url);\n');

const importFromDisk = createRequire(loaderPath)(loaderPath);

importFromDisk(pathToFileURL(bundlePath).href).catch((err) => {
  console.error('[caesar] fatal during boot:', err);
  process.exit(1);
});
