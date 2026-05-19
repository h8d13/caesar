'use strict';

// SEA main script. CJS-only per Node 24 docs.
// The real server is the ESM bundle stored as a SEA asset. We write it
// to a sibling file of the working directory and dynamic-import it so:
//   1) top-level await inside the bundle works (data: URLs cant resolve
//      bare specifiers, but a real path can).
//   2) bare specifier resolution finds /app/node_modules/argon2 from cwd.
//
// CWD is expected to be the deploy root (Dockerfile sets WORKDIR /app
// where node_modules/argon2 sits beside this binary).

const fs = require('node:fs');
const path = require('node:path');
const sea = require('node:sea');

const bundleSrc = sea.getAsset('main.mjs', 'utf8');
const bundlePath = path.join(process.cwd(), '.caesar-runtime.mjs');

fs.writeFileSync(bundlePath, bundleSrc);

import(bundlePath).catch((err) => {
  console.error('[caesar] fatal during boot:', err);
  process.exit(1);
});
