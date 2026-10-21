#!/usr/bin/env node
// Assembles the npm packages that mirror the uWebSockets.js prebuilt binaries:
//   - @mionjs/native-uws-<os>-<arch>  one per platform (os/cpu-gated payload, the 3
//                              Node-ABI .node files upstream ships for it)
//   - @mionjs/bin-uws              the loader shim, with optionalDependencies filled
//
// uWebSockets.js is deliberately NOT on npm (upstream distributes prebuilt
// binaries inside git tags), and this workspace bans git dependency specifiers —
// so the release republishes the Apache-2.0 binaries as per-platform npm
// packages, the exact @mionjs/native-compiler-* strategy (build-binaries.mjs), with
// a fetch step standing in for the Go cross-compile. Binaries are downloaded at
// the tag pinned in packages/bin-uws/package.json (`uwsTag`) and sha256-verified
// against the committed packages/bin-uws/uws-checksums.json by fetch-uws.mjs.
//
// Output is staged under dist-binaries/ (gitignored), appended to
// publish-order.json payloads-first so the shim never publishes before its
// optional deps. build-binaries.mjs invokes this script at the end of its run;
// pack.mjs then packs the staged dirs and skips the workspace @mionjs/bin-uws copy.
//
// These packages ride the same release train as everything else under @mionjs/*:
// the verdaccio-backed pre-publish e2e installs them, then publish-tarballs.mjs
// stages them payloads-first.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {selectUwsPlatforms, uwsPackageName} from '../lib/binary-platforms.mjs';
import {allUwsFiles, ensureUwsBinaries, readUwsTag, UWS_LICENSE_FILE, UWS_PKG_DIR, uwsFilesFor} from '../lib/fetch-uws.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const STAGING_DIR = path.join(REPO_ROOT, 'dist-binaries');

function platformReadme(name, platform, tag) {
  return `# ${name}

Prebuilt **uWebSockets.js** native binaries for ${platform.os}-${platform.cpu} — an unmodified npm
mirror of the Apache-2.0 release binaries from
[uNetworking/uWebSockets.js](https://github.com/uNetworking/uWebSockets.js) at tag ${tag}.

You never install this package directly. It rides as a per-platform optional
dependency of [\`@mionjs/bin-uws\`](https://www.npmjs.com/package/@mionjs/bin-uws),
which resolves the one matching your machine for
[\`@mionjs/platform-uws\`](https://www.npmjs.com/package/@mionjs/platform-uws).

## Documentation

Full guides live at **[mion.io](https://mion.io/)**.
[Source and issues](https://github.com/MionKit/mion).

## License

Apache-2.0 (the upstream uWebSockets.js license, shipped verbatim). See
[LICENSE](https://github.com/uNetworking/uWebSockets.js/blob/master/LICENSE).
`;
}

function stagePlatform(platform, version, tag, cacheDir, shimPkg) {
  const name = uwsPackageName(platform);
  const pkgDir = path.join(STAGING_DIR, name);
  const libDir = path.join(pkgDir, 'lib');
  fs.mkdirSync(libDir, {recursive: true});

  const prefix = `uws_${platform.os}_${platform.cpu}_`;
  const binaries = allUwsFiles().filter((file) => file.startsWith(prefix));
  if (binaries.length === 0) throw new Error(`no ${prefix}*.node files in the uws manifest — PLATFORMS drifted from fetch-uws.mjs`);
  console.log(`  - ${name}  (${binaries.length} Node-ABI binaries)`);
  for (const file of binaries) fs.copyFileSync(path.join(cacheDir, file), path.join(libDir, file));

  const packageJson = {
    name,
    version,
    description: `Prebuilt uWebSockets.js native binaries for ${platform.os}-${platform.cpu} (npm mirror of uNetworking/uWebSockets.js ${tag}).`,
    homepage: shimPkg.homepage,
    bugs: shimPkg.bugs,
    license: 'Apache-2.0',
    os: [platform.os],
    cpu: [platform.cpu],
    files: ['lib'],
    exports: {'./package.json': './package.json'},
    repository: {type: shimPkg.repository.type, url: shimPkg.repository.url},
    publishConfig: {access: 'public'},
    uwsTag: tag,
  };
  fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify(packageJson, null, 2) + '\n');
  // The binaries are upstream's work: ship the upstream Apache-2.0 LICENSE
  // verbatim (fetched + hash-verified alongside the binaries), never this repo's.
  fs.copyFileSync(path.join(cacheDir, UWS_LICENSE_FILE), path.join(pkgDir, 'LICENSE'));
  // npm always packs a README; without one the package's npm page renders blank.
  fs.writeFileSync(path.join(pkgDir, 'README.md'), platformReadme(name, platform, tag));
  return name;
}

function stageShim(version, platformNames) {
  const destDir = path.join(STAGING_DIR, '@mionjs/bin-uws');
  // Copy only the publishable files (never node_modules, .uws-cache or stray cruft).
  fs.cpSync(UWS_PKG_DIR, destDir, {
    recursive: true,
    filter(src) {
      const rel = path.relative(UWS_PKG_DIR, src);
      return rel === '' || rel === 'README.md' || rel === 'package.json' || rel.startsWith('lib');
    },
  });

  const pkg = JSON.parse(fs.readFileSync(path.join(UWS_PKG_DIR, 'package.json'), 'utf8'));
  pkg.version = version;
  // The lockstep mechanism: every platform package pinned EXACT-EQUAL to this version.
  pkg.optionalDependencies = Object.fromEntries(platformNames.map((name) => [name, version]));
  delete pkg.scripts;
  delete pkg['comment:optionalDependencies'];
  fs.writeFileSync(path.join(destDir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  // The shim is this repo's own MIT code (the payloads carry the Apache-2.0 one).
  fs.copyFileSync(path.join(REPO_ROOT, 'LICENSE'), path.join(destDir, 'LICENSE'));
}

// The lockstep version, read from the shim itself rather than version.json so a
// missed bump-version.mjs stamp shows up as a mismatch (e2e.mjs's
// readMionVersion asserts every @mionjs/* package agrees).
function readMionVersion() {
  return JSON.parse(fs.readFileSync(path.join(UWS_PKG_DIR, 'package.json'), 'utf8')).version;
}

// `hostOnly` stages just this machine's platform package (and fetches just its
// binaries), the same switch as build-binaries.mjs's --host-only; the shim then
// names only that one. Never a release set: publish-tarballs.mjs refuses it.
export async function main({hostOnly = false} = {}) {
  const tag = readUwsTag();
  const version = readMionVersion();
  const platforms = selectUwsPlatforms({hostOnly});
  console.log(`\nStaging uWebSockets.js mirror packages — version ${version}, uws ${tag}${hostOnly ? ' (host platform only)' : ''}\n`);

  const cacheDir = await ensureUwsBinaries(hostOnly ? {only: [...platforms.flatMap(uwsFilesFor), UWS_LICENSE_FILE]} : {all: true});
  fs.mkdirSync(STAGING_DIR, {recursive: true});

  const shimPkg = JSON.parse(fs.readFileSync(path.join(UWS_PKG_DIR, 'package.json'), 'utf8'));
  const platformNames = platforms.map((platform) => stagePlatform(platform, version, tag, cacheDir, shimPkg));
  stageShim(version, platformNames);

  // Payload packages first, the shim last — append to build-binaries.mjs' order.
  const orderFile = path.join(STAGING_DIR, 'publish-order.json');
  const publishOrder = fs.existsSync(orderFile) ? JSON.parse(fs.readFileSync(orderFile, 'utf8')) : [];
  publishOrder.push(...platformNames, '@mionjs/bin-uws');
  fs.writeFileSync(orderFile, JSON.stringify(publishOrder, null, 2) + '\n');

  console.log(`\nStaged ${platformNames.length} uws platform packages + the @mionjs/bin-uws shim under ${path.relative(REPO_ROOT, STAGING_DIR)}/`);
  console.log(`Publish order (appended): ${[...platformNames, '@mionjs/bin-uws'].join(' -> ')}`);
}

if (import.meta.main) {
  main({hostOnly: process.argv.includes('--host-only')}).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
