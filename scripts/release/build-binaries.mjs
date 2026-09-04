#!/usr/bin/env node
// Cross-compiles the mion resolver binary for every supported platform
// and assembles the npm packages that distribute them:
//   - @mionjs/native-compiler-<os>-<arch>  one per platform (os/cpu-gated payload)
//   - @mionjs/bin-compiler                 the launcher, with optionalDependencies filled
//
// Output is staged under dist-binaries/ (gitignored). This script does NOT
// publish — scripts/release/publish.mjs runs it, then publishes the platform packages
// FIRST and the launcher LAST, so a consumer never resolves a launcher whose
// optional deps aren't on the registry yet. Mirrors microsoft/typescript-go's
// Herebyfile packing step.
//
// Pure Go (CGO_ENABLED=0, no `import "C"`), so all targets cross-compile from
// any host with the Go toolchain — no per-platform C toolchain required.
//
// Flags:
//   --host-only   build ONLY this machine's platform package. For a lane that
//                 installs the packed tarballs on the platform that built them
//                 (the drizzle-e2e workflow: ubuntu runners, linux/amd64
//                 containers), the other six cross-builds are ~15 minutes of
//                 wasted runner; the uws mirror (build-uws-binaries.mjs) follows
//                 the same switch. The launcher's / shim's optionalDependencies
//                 and publish-order.json list only what was staged, so pack.mjs
//                 still produces a consistent set. NEVER a release:
//                 publish-tarballs.mjs refuses a tarball set missing a platform.

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {platformPackageName, selectPlatforms} from '../lib/binary-platforms.mjs';
import {main as stageUwsPackages} from './build-uws-binaries.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GO_ROOT = path.join(REPO_ROOT, 'ts-go-runtypes');
const GO_MODULE = 'github.com/mionkit/mion/ts-go-runtypes';
const GO_PKG = './cmd/mion';
const STAGING_DIR = path.join(REPO_ROOT, 'dist-binaries');
const LAUNCHER_SRC = path.join(REPO_ROOT, 'packages', 'bin-compiler');
const LICENSE_SRC = path.join(REPO_ROOT, 'LICENSE');

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

function exeName(platform) {
  return platform.os === 'win32' ? 'mion.exe' : 'mion';
}

function platformReadme(name, platform) {
  return `# ${name}

Prebuilt **RunTypes** compiler binary for ${platform.os}-${platform.cpu}.

You never install this package directly. It rides as a per-platform optional
dependency of [\`@mionjs/bin-compiler\`](https://www.npmjs.com/package/@mionjs/bin-compiler),
which resolves the one matching your machine, and that launcher is itself pulled in
by [\`@mionjs/devtools\`](https://www.npmjs.com/package/@mionjs/devtools).

## Documentation

Full guides live at **[mion.pages.dev/runtypes](https://mion.pages.dev/runtypes)**.
[Source and issues](https://github.com/MionKit/mion).

## License

MIT. See
[LICENSE](https://github.com/MionKit/mion/blob/main/LICENSE).
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
    description: `Prebuilt mion resolver binary for ${platform.os}-${platform.cpu}.`,
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
  // Ship the repo LICENSE (MIT) with every published binary package. npm always
  // includes a LICENSE file in the tarball, even though `files` lists only lib/.
  fs.copyFileSync(LICENSE_SRC, path.join(pkgDir, 'LICENSE'));
  // Same story for the README: npm always packs it, and without one the package's
  // npm page renders blank. These are payload packages nobody installs by hand, so
  // it says what the payload is and points at the launcher and the docs.
  fs.writeFileSync(path.join(pkgDir, 'README.md'), platformReadme(name, platform));
  return name;
}

function stageLauncher(version, tsgo, platformNames) {
  const destDir = path.join(STAGING_DIR, '@mionjs/bin-compiler');
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
  // Same LICENSE as every other published package.
  fs.copyFileSync(LICENSE_SRC, path.join(destDir, 'LICENSE'));
}

function parseArgs(args) {
  const unknown = args.find((arg) => arg !== '--host-only');
  if (unknown) throw new Error(`build-binaries: unknown argument '${unknown}' (the only flag is --host-only).`);
  return {hostOnly: args.includes('--host-only')};
}

async function main(args) {
  const {hostOnly} = parseArgs(args);
  const platforms = selectPlatforms({hostOnly});
  const version = readVersion();
  const tsgo = readTsgoRevision();
  console.log(`Staging mion binary packages — version ${version}, tsgo ${tsgo}\n`);
  console.log(`Building plain go binaries (go build -trimpath, CGO_ENABLED=0)${hostOnly ? ' for the HOST platform only (--host-only: not a release set)' : ''}\n`);

  fs.rmSync(STAGING_DIR, {recursive: true, force: true});
  fs.mkdirSync(STAGING_DIR, {recursive: true});

  const launcherPkg = JSON.parse(fs.readFileSync(path.join(LAUNCHER_SRC, 'package.json'), 'utf8'));
  const platformNames = platforms.map((platform) => buildPlatform(platform, version, tsgo, launcherPkg));
  stageLauncher(version, tsgo, platformNames);

  // Platform packages first, launcher last.
  const publishOrder = [...platformNames, '@mionjs/bin-compiler'];
  fs.writeFileSync(path.join(STAGING_DIR, 'publish-order.json'), JSON.stringify(publishOrder, null, 2) + '\n');

  console.log(`\nStaged ${platformNames.length} platform packages + launcher under ${path.relative(REPO_ROOT, STAGING_DIR)}/`);
  console.log(`Publish order: ${publishOrder.join(' -> ')}`);

  // The uWebSockets.js mirror rides the same staging area: payload packages +
  // the @mionjs/bin-uws shim, appended to publish-order.json payloads-first, packed
  // and published with everything else. Host-only applies to it too.
  await stageUwsPackages({hostOnly});
}

main(process.argv.slice(2)).catch((err) => {
  console.error(err);
  process.exit(1);
});
