#!/usr/bin/env node
// Trim a `pnpm deploy --prod` node_modules to what runs, then prove it
// still does. Usage: node prune-node-modules.mjs <node_modules>
//
// `pnpm deploy --prod` installs what packages declare, and the externalized
// deps declare more than they load: mediasoup ships its C++ worker sources
// and lists its postinstall downloader's deps (tar, node-fetch and their
// trees) as `dependencies`. None of that is read once the prebuilt worker
// is in place, and it is over half of the tree.
//
// Linux-only, like sea.mjs: run it on the arch and libc the image ships.

import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Declared dependencies only an install script uses. Everything reachable
// only through one of these edges goes too (tar -> minipass, ...), so a
// bump of their trees needs no edit here.
const INSTALL_ONLY = {
  // npm-scripts.mjs postinstall: download + untar the prebuilt worker
  mediasoup: ['tar', 'node-fetch'],
  // `install` script env wrapper, and headers for a source build
  argon2: ['cross-env', 'node-addon-api'],
  // types published as a runtime dependency
  '@libsql/isomorphic-ws': ['@types/ws']
};

// Paths inside a package that only matter for building it from source.
const BUILD_ONLY = {
  mediasoup: [
    'npm-scripts.mjs',
    'node/lib/test',
    'worker/Makefile',
    'worker/fbs',
    'worker/fuzzer',
    'worker/include',
    'worker/meson.build',
    'worker/meson_options.txt',
    'worker/mocks',
    'worker/scripts',
    'worker/src',
    'worker/subprojects',
    'worker/tasks.py',
    'worker/test'
  ],
  argon2: ['argon2', 'argon2.cpp', 'binding.gyp']
};

// Never loaded by node: declarations and sourcemaps.
const DEAD_FILE = /\.d\.[cm]?ts$|\.map$/;

const root = path.resolve(process.argv[2] ?? '');
const store = path.join(root, '.pnpm');

if (!existsSync(store)) {
  console.error(`No pnpm node_modules at ${root}`);
  process.exit(1);
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

const sizeOf = (target) => {
  const stat = lstatSync(target);

  if (!stat.isDirectory()) return stat.size;

  return readdirSync(target).reduce((sum, name) => sum + sizeOf(path.join(target, name)), 0);
};

const before = sizeOf(root);

// --- packages: keep what is reachable from the deployed manifest ---
// pnpm layout: .pnpm/<id>/node_modules/<name> is the package, its
// dependencies are symlinks next to it.
const keep = new Set();
const dirsOf = new Map();

const visit = (pkgDir) => {
  const real = realpathSync(pkgDir);

  if (keep.has(real)) return;

  keep.add(real);

  const pkg = readJson(path.join(real, 'package.json'));
  const siblings = real.slice(0, real.length - pkg.name.length);
  const skipped = INSTALL_ONLY[pkg.name] ?? [];

  dirsOf.set(pkg.name, [...(dirsOf.get(pkg.name) ?? []), real]);

  for (const name of Object.keys({
    ...pkg.dependencies,
    ...pkg.optionalDependencies,
    ...pkg.peerDependencies
  })) {
    const dep = path.join(siblings, name);

    // absent = an optional dependency for another platform, or an
    // optional peer
    if (!skipped.includes(name) && existsSync(dep)) visit(dep);
  }
};

const manifest = readJson(path.join(root, '..', 'package.json'));

for (const name of Object.keys(manifest.dependencies ?? {})) {
  visit(path.join(root, name));
}

// a rule naming a package that is gone would otherwise rot unnoticed
for (const name of [...Object.keys(INSTALL_ONLY), ...Object.keys(BUILD_ONLY)]) {
  if (!dirsOf.has(name)) {
    console.error(`prune rule for '${name}', which is not in ${root}`);
    process.exit(1);
  }
}

for (const id of readdirSync(store)) {
  // node_modules = pnpm's hoisting dir, only links; handled below
  if (id === 'node_modules') continue;

  const modules = path.join(store, id, 'node_modules');

  if (!existsSync(modules)) continue;

  const used = [...keep].some((dir) => dir.startsWith(modules + path.sep));

  if (!used) rmSync(path.join(store, id), { recursive: true });
}

// --- files inside the kept packages ---
for (const [name, paths] of Object.entries(BUILD_ONLY)) {
  for (const dir of dirsOf.get(name)) {
    for (const entry of paths) rmSync(path.join(dir, entry), { recursive: true, force: true });
  }
}

// argon2 loads one prebuild through node-gyp-build: this platform-arch,
// and the .node for this libc.
const libc = process.report.getReport().header.glibcVersionRuntime ? 'glibc' : 'musl';

for (const dir of dirsOf.get('argon2')) {
  const prebuilds = path.join(dir, 'prebuilds');
  const own = `${process.platform}-${process.arch}`;

  for (const name of readdirSync(prebuilds)) {
    if (name !== own) rmSync(path.join(prebuilds, name), { recursive: true });
  }

  for (const name of readdirSync(path.join(prebuilds, own))) {
    if (!name.includes(`.${libc}.`)) rmSync(path.join(prebuilds, own, name));
  }
}

// declarations, sourcemaps, .bin shims and links left dangling above
const sweep = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isSymbolicLink()) {
      if (!existsSync(full)) rmSync(full);
    } else if (entry.isDirectory()) {
      if (entry.name === '.bin') rmSync(full, { recursive: true });
      else sweep(full);
    } else if (DEAD_FILE.test(entry.name)) {
      rmSync(full);
    }
  }
};

sweep(root);

const after = sizeOf(root);
const mb = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`;

console.log(`Pruned ${path.relative(process.cwd(), root)}: ${mb(before)} -> ${mb(after)}`);

// --- still runs? ---
// Each externalized dep does its real job from the pruned tree, so a prune
// that cut too deep (or an upstream that starts loading what was cut)
// fails the build instead of the server at boot.
const require = createRequire(path.join(root, '..', 'package.json'));
const load = async (name) => {
  const module = await import(pathToFileURL(require.resolve(name)).href);

  return module.default ?? module;
};

const mediasoup = await load('mediasoup');
const worker = await mediasoup.createWorker({ logLevel: 'warn' });
const router = await worker.createRouter({
  mediaCodecs: [
    { kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
    {
      kind: 'video',
      mimeType: 'video/H264',
      clockRate: 90000,
      parameters: { 'packetization-mode': 1, 'profile-level-id': '42e01f' }
    }
  ]
});

await router.createWebRtcTransport({ listenInfos: [{ protocol: 'udp', ip: '127.0.0.1' }] });
worker.close();

const argon2 = await load('argon2');

if (!(await argon2.verify(await argon2.hash('prune'), 'prune'))) {
  throw new Error('argon2 did not verify its own hash');
}

const { createClient } = await load('@libsql/client');
const db = createClient({ url: ':memory:' });

await db.execute('select 1');
db.close();

console.log('Pruned node_modules still runs mediasoup, argon2 and @libsql/client');
