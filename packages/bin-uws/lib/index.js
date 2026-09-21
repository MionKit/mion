import fs from 'node:fs';
import module from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// uWebSockets.js binaries are raw V8 addons (not node-api), one per platform-arch-ABI triple, named
// as upstream commits them. The tables below mirror what the pinned `uwsTag` ships, so bumping it
// means re-checking BOTH (upstream drops and adds Node majors) plus regenerating uws-checksums.json.
const SUPPORTED_PLATFORMS = ['linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64', 'win32-x64'];
const ABI_TO_NODE_MAJOR = {127: '22', 137: '24', 147: '26'};

// Points the loader at a DIRECTORY holding the .node binary, overriding both lookups below; the
// file must be named uws_<platform>_<arch>_<abi>.node to match the host. Checked BEFORE the
// support-matrix validation on purpose, so a self-built binary for an out-of-matrix ABI still loads.
const OVERRIDE_ENV = 'MION_UWS_BINARY_DIR';

function binaryFileName(platform, arch, abi) {
  return `uws_${platform}_${arch}_${abi}.node`;
}

// Read from this package's own manifest, so the loader and the fetch/staging scripts cannot disagree.
function uwsTag() {
  const manifest = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'));
  return manifest.uwsTag;
}

// An empty value behaves like not setting it. A value that names no directory throws instead of
// falling through: a typo must fail loudly, never silently load a DIFFERENT binary.
function overrideDir(env) {
  const raw = env[OVERRIDE_ENV];
  if (!raw || raw.trim() === '') return null;
  const dir = path.resolve(raw.trim());
  let stats;
  try {
    stats = fs.statSync(dir);
  } catch {
    throw new Error(`[mion-uws] ${OVERRIDE_ENV}=${raw} does not exist (resolved to ${dir}).`);
  }
  if (!stats.isDirectory()) {
    throw new Error(`[mion-uws] ${OVERRIDE_ENV}=${raw} is not a directory (resolved to ${dir}).`);
  }
  return dir;
}

// import.meta.resolve is sync on Node >= 20.6; createRequire is the fallback.
function resolvePackageJson(specifier) {
  if (typeof import.meta.resolve === 'function') {
    return fileURLToPath(import.meta.resolve(specifier));
  }
  const require = module.createRequire(import.meta.url);
  return require.resolve(specifier);
}

// MION_UWS_BINARY_DIR wins, then this repo's on-demand dev cache, then the optional dependency
// @mionjs/native-uws-<platform>-<arch>. The `host` argument exists so tests can drive every error
// path without faking process globals; production callers pass nothing.
export function resolveUwsBinaryPath(host = {}) {
  const platform = host.platform ?? process.platform;
  const arch = host.arch ?? process.arch;
  const abi = host.abi ?? process.versions.modules;
  const env = host.env ?? process.env;
  const binaryFile = binaryFileName(platform, arch, abi);

  const overridden = overrideDir(env);
  if (overridden) {
    const exe = path.join(overridden, binaryFile);
    if (!fs.existsSync(exe)) {
      throw new Error(`[mion-uws] ${OVERRIDE_ENV} is set but ${exe} does not exist.`);
    }
    return exe;
  }

  const platformKey = `${platform}-${arch}`;
  if (!SUPPORTED_PLATFORMS.includes(platformKey)) {
    throw new Error(
      `[mion-uws] uWebSockets.js ${uwsTag()} ships no binary for ${platformKey}. ` +
        `Supported platforms: ${SUPPORTED_PLATFORMS.join(', ')} (glibc only on Linux). ` +
        `For a self-built binary, point ${OVERRIDE_ENV} at a directory containing ${binaryFile}.`,
    );
  }
  if (!ABI_TO_NODE_MAJOR[abi]) {
    const supportedMajors = Object.values(ABI_TO_NODE_MAJOR).join(', ');
    throw new Error(
      `[mion-uws] uWebSockets.js ${uwsTag()} supports only Node.js ${supportedMajors} ` +
        `(prebuilt ABIs ${Object.keys(ABI_TO_NODE_MAJOR).join(', ')}); this process is ABI ${abi}. ` +
        `Switch Node versions, or point ${OVERRIDE_ENV} at a directory containing a self-built ${binaryFile}.`,
    );
  }

  const here = path.dirname(fileURLToPath(import.meta.url));
  const normalized = here.replace(/\\/g, '/');
  const inDevTree = normalized.endsWith('/packages/bin-uws/lib');

  // Dev: prefer the on-demand-fetched cache so the monorepo needs no platform package installed.
  if (inDevTree) {
    const devExe = path.join(here, '..', '.uws-cache', uwsTag(), binaryFile);
    if (fs.existsSync(devExe)) return devExe;
    // Not fetched yet — fall through so the thrown error points at the real fix.
  }

  const platformPackage = `@mionjs/native-uws-${platformKey}`;
  let exeDir;
  try {
    const packageJsonPath = resolvePackageJson(`${platformPackage}/package.json`);
    exeDir = path.join(path.dirname(packageJsonPath), 'lib');
  } catch {
    if (inDevTree) {
      throw new Error(
        `[mion-uws] the dev binary cache is empty (packages/bin-uws/.uws-cache/${uwsTag()}/${binaryFile} missing). ` +
          `Run \`pnpm miondevx core build uws\` (or \`node scripts/lib/fetch-uws.mjs\`) to fetch it.`,
      );
    }
    throw new Error(
      `[mion-uws] Unable to resolve ${platformPackage}. Its optional dependency was not installed ` +
        `(e.g. install ran with --no-optional / --ignore-optional, or a registry mirror omits it) — ` +
        `reinstall with optional dependencies enabled, or point ${OVERRIDE_ENV} at a directory containing ${binaryFile}.`,
    );
  }

  const exe = path.join(exeDir, binaryFile);
  if (!fs.existsSync(exe)) {
    throw new Error(`[mion-uws] ${platformPackage} is installed but its binary is missing at ${exe}.`);
  }
  return exe;
}

let native;
// The addon is the whole API (upstream's own uws.js is a bare require of it), so no wrapper layer
// sits between callers and uWS.
export function loadUws() {
  if (!native) {
    const require = module.createRequire(import.meta.url);
    native = require(resolveUwsBinaryPath());
  }
  return native;
}
