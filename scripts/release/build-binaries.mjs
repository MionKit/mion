#!/usr/bin/env node
// Cross-compiles the ts-runtypes resolver binary for every supported platform
// and assembles the npm packages that distribute them:
//   - @ts-runtypes/binary-<os>-<arch>  one per platform (os/cpu-gated payload)
//   - @ts-runtypes/bin                 the launcher, with optionalDependencies filled
//
// Output is staged under dist-binaries/ (gitignored). This script does NOT
// publish — scripts/release/publish.mjs runs it, then publishes the platform packages
// FIRST and the launcher LAST, so a consumer never resolves a launcher whose
// optional deps aren't on the registry yet. Mirrors microsoft/typescript-go's
// Herebyfile packing step.
//
// Pure Go (CGO_ENABLED=0, no `import "C"`), so all targets cross-compile from
// any host with the Go toolchain — no per-platform C toolchain required.

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GO_ROOT = path.join(REPO_ROOT, 'ts-go-runtypes');
const GO_MODULE = 'github.com/mionkit/ts-runtypes';
const GO_PKG = './cmd/ts-runtypes';
const STAGING_DIR = path.join(REPO_ROOT, 'dist-binaries');
const LAUNCHER_SRC = path.join(REPO_ROOT, 'packages', 'ts-runtypes-bin');
const LICENSE_SRC = path.join(REPO_ROOT, 'LICENSE');

// node os / cpu (the package.json os/cpu fields and process.platform/arch keys)
// → Go GOOS / GOARCH. Keep in lockstep with getExePath()'s platform key.
const PLATFORMS = [
  {os: 'linux', cpu: 'x64', goos: 'linux', goarch: 'amd64'},
  {os: 'linux', cpu: 'arm64', goos: 'linux', goarch: 'arm64'},
  {os: 'linux', cpu: 'arm', goos: 'linux', goarch: 'arm', goarm: '6'},
  {os: 'darwin', cpu: 'x64', goos: 'darwin', goarch: 'amd64'},
  {os: 'darwin', cpu: 'arm64', goos: 'darwin', goarch: 'arm64'},
  {os: 'win32', cpu: 'x64', goos: 'windows', goarch: 'amd64'},
  {os: 'win32', cpu: 'arm64', goos: 'windows', goarch: 'arm64'},
];

function readVersion() {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'version.json'), 'utf8'));
  if (!manifest.version || manifest.version === 'independent') {
    throw new Error('version.json has no fixed lockstep version to stamp binary packages with.');
  }
  return manifest.version;
}

function readTsgoRevision() {
  try {
    return execFileSync('git', ['-C', path.join(GO_ROOT, 'third_party', 'tsgolint'), 'rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'unknown';
  }
}

function platformPackageName(platform) {
  return `@ts-runtypes/binary-${platform.os}-${platform.cpu}`;
}

function exeName(platform) {
  return platform.os === 'win32' ? 'ts-runtypes.exe' : 'ts-runtypes';
}

function platformReadme(name, platform) {
  return `# ${name}

Prebuilt **RunTypes** compiler binary for ${platform.os}-${platform.cpu}.

You never install this package directly. It rides as a per-platform optional
dependency of [\`@ts-runtypes/bin\`](https://www.npmjs.com/package/@ts-runtypes/bin),
which resolves the one matching your machine, and that launcher is itself pulled in
by [\`@ts-runtypes/devtools\`](https://www.npmjs.com/package/@ts-runtypes/devtools).

## Documentation

Full guides live at **[runtypes.pages.dev](https://runtypes.pages.dev/)**.
[Source and issues](https://github.com/MionKit/ts-run-types).

## License

Proprietary — all rights reserved. No use, copying, or distribution without prior
written authorization. See
[LICENSE](https://github.com/MionKit/ts-run-types/blob/main/LICENSE).
`;
}

function buildPlatform(platform, version, tsgo, launcherPkg) {
  const name = platformPackageName(platform);
  const pkgDir = path.join(STAGING_DIR, name);
  const libDir = path.join(pkgDir, 'lib');
  fs.mkdirSync(libDir, {recursive: true});

  const ldflags = [
    '-s',
    '-w',
    `-X ${GO_MODULE}/internal/constants.Version=${version}`,
    `-X ${GO_MODULE}/internal/constants.TsgoVersion=${tsgo}`,
  ].join(' ');

  const env = {...process.env, CGO_ENABLED: '0', GOOS: platform.goos, GOARCH: platform.goarch};
  if (platform.goarm) env.GOARM = platform.goarm;

  const goarm = platform.goarm ? ` GOARM=${platform.goarm}` : '';
  console.log(`  - ${name}  (GOOS=${platform.goos} GOARCH=${platform.goarch}${goarm})`);
  const outFile = path.join(libDir, exeName(platform));
  execFileSync('go', ['build', '-trimpath', `-ldflags=${ldflags}`, '-o', outFile, GO_PKG], {
    cwd: GO_ROOT,
    env,
    stdio: 'inherit',
  });

  const packageJson = {
    name,
    version,
    description: `Prebuilt ts-runtypes resolver binary for ${platform.os}-${platform.cpu}.`,
    homepage: launcherPkg.homepage,
    bugs: launcherPkg.bugs,
    license: launcherPkg.license,
    os: [platform.os],
    cpu: [platform.cpu],
    files: ['lib'],
    exports: {'./package.json': './package.json'},
    repository: {type: launcherPkg.repository.type, url: launcherPkg.repository.url},
    publishConfig: {access: 'public'},
  };
  fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify(packageJson, null, 2) + '\n');
  // Ship the proprietary LICENSE with every published binary package. npm always
  // includes a LICENSE file in the tarball, even though `files` lists only lib/.
  fs.copyFileSync(LICENSE_SRC, path.join(pkgDir, 'LICENSE'));
  // Same story for the README: npm always packs it, and without one the package's
  // npm page renders blank. These are payload packages nobody installs by hand, so
  // it says what the payload is and points at the launcher and the docs.
  fs.writeFileSync(path.join(pkgDir, 'README.md'), platformReadme(name, platform));
  return name;
}

function stageLauncher(version, tsgo, platformNames) {
  const destDir = path.join(STAGING_DIR, '@ts-runtypes/bin');
  // Copy only the publishable files (never node_modules or stray cruft).
  fs.cpSync(LAUNCHER_SRC, destDir, {
    recursive: true,
    filter(src) {
      const rel = path.relative(LAUNCHER_SRC, src);
      return rel === '' || rel === 'README.md' || rel === 'package.json' || rel.startsWith('lib') || rel.startsWith('bin');
    },
  });

  const pkg = JSON.parse(fs.readFileSync(path.join(LAUNCHER_SRC, 'package.json'), 'utf8'));
  pkg.version = version;
  pkg.tsgo = tsgo;
  // The lockstep mechanism: every platform package pinned EXACT-EQUAL to this version.
  pkg.optionalDependencies = Object.fromEntries(platformNames.map((name) => [name, version]));
  delete pkg['comment:tsgo'];
  delete pkg['comment:optionalDependencies'];
  fs.writeFileSync(path.join(destDir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  // Same proprietary LICENSE as every other published package.
  fs.copyFileSync(LICENSE_SRC, path.join(destDir, 'LICENSE'));
}

function main() {
  const version = readVersion();
  const tsgo = readTsgoRevision();
  console.log(`Staging ts-runtypes binary packages — version ${version}, tsgo ${tsgo}\n`);
  console.log('Building plain go binaries (go build -trimpath, CGO_ENABLED=0)\n');

  fs.rmSync(STAGING_DIR, {recursive: true, force: true});
  fs.mkdirSync(STAGING_DIR, {recursive: true});

  const launcherPkg = JSON.parse(fs.readFileSync(path.join(LAUNCHER_SRC, 'package.json'), 'utf8'));
  const platformNames = PLATFORMS.map((platform) => buildPlatform(platform, version, tsgo, launcherPkg));
  stageLauncher(version, tsgo, platformNames);

  // Platform packages first, launcher last.
  const publishOrder = [...platformNames, '@ts-runtypes/bin'];
  fs.writeFileSync(path.join(STAGING_DIR, 'publish-order.json'), JSON.stringify(publishOrder, null, 2) + '\n');

  console.log(`\nStaged ${platformNames.length} platform packages + launcher under ${path.relative(REPO_ROOT, STAGING_DIR)}/`);
  console.log(`Publish order: ${publishOrder.join(' -> ')}`);
}

main();
