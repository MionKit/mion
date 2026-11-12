import fs from 'node:fs';
import module from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Basename inside every platform package's lib/, and of the dev binary at <repo>/mion-bin/.
const EXE_BASENAME = 'mion';

// An extension launcher: when installed beside this package, its binary (mion plus the extensions) wins.
const PRO_LAUNCHER = '@mionkit/pro-bin-compiler';

// Points the launcher at a specific resolver build, overriding both lookups below, and the ONLY
// escape hatch the lint lane has; a bundler plugin's explicit `binary` option still wins over it.
const OVERRIDE_ENV = 'MION_BIN';

function exeName() {
  return process.platform === 'win32' ? `${EXE_BASENAME}.exe` : EXE_BASENAME;
}

// An empty value is a no-op, so `MION_BIN=` in a .env behaves like not setting it at all.
// A value that names no executable throws instead of falling through: a typo must fail loudly.
function overrideExe() {
  const raw = process.env[OVERRIDE_ENV];
  if (!raw || raw.trim() === '') return null;
  const exe = path.resolve(raw.trim());
  let stats;
  try {
    stats = fs.statSync(exe);
  } catch {
    throw new Error(`[mion] ${OVERRIDE_ENV}=${raw} does not exist (resolved to ${exe}).`);
  }
  if (!stats.isFile()) {
    throw new Error(`[mion] ${OVERRIDE_ENV}=${raw} is not a file (resolved to ${exe}).`);
  }
  if (process.platform !== 'win32') {
    try {
      fs.accessSync(exe, fs.constants.X_OK);
    } catch {
      throw new Error(`[mion] ${OVERRIDE_ENV}=${raw} is not executable (resolved to ${exe}); chmod +x it.`);
    }
  }
  return exe;
}

// Fallback for a runtime or loader without import.meta.resolve.
// package.json rather than the binary, so the lookup never depends on an exports map.
function resolvePackageJson(specifier) {
  if (typeof import.meta.resolve === 'function') {
    return fileURLToPath(import.meta.resolve(specifier));
  }
  const require = module.createRequire(import.meta.url);
  return require.resolve(specifier);
}

// The project a lookup starts in: the nearest directory outside node_modules that holds a package.json, widened
// to its workspace root (pnpm-workspace.yaml, or a package.json with `workspaces`). The launcher walk stops there,
// so a launcher installed in some ancestor (a stray one in $HOME) never takes over a project below it.
function projectBoundary(start) {
  const project = nearestProject(start);
  if (!project) return null;
  for (let dir = project; ; dir = path.dirname(dir)) {
    if (isWorkspaceRoot(dir)) return dir;
    if (path.dirname(dir) === dir) return project;
  }
}

function nearestProject(start) {
  for (let dir = start; ; dir = path.dirname(dir)) {
    if (!dir.split(path.sep).includes('node_modules') && fs.existsSync(path.join(dir, 'package.json'))) return dir;
    if (path.dirname(dir) === dir) return null;
  }
}

function isWorkspaceRoot(dir) {
  if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return true;
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).workspaces !== undefined;
  } catch {
    return false;
  }
}

// The pro launcher's directory: node_modules/@mionkit/pro-bin-compiler in `start` or an ancestor up to the project
// boundary, as Node looks. A walk on disk, not require.resolve, so an ESM-only exports map needs no `require`
// condition; Yarn Plug'n'Play installs, which have no node_modules, are not found.
function findProLauncher(start) {
  const boundary = projectBoundary(start);
  if (!boundary) return null;
  for (let dir = start; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', PRO_LAUNCHER);
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
    if (dir === boundary || path.dirname(dir) === dir) return null;
  }
}

// The ESM entry an exports target names: a path, the first resolvable of an array, or the `import` / `node` /
// `default` branch of a conditions object, nested as deep as the map goes. Undefined when none applies.
function exportTarget(target) {
  if (typeof target === 'string') return target;
  if (Array.isArray(target)) {
    for (const item of target) {
      const found = exportTarget(item);
      if (found) return found;
    }
    return undefined;
  }
  if (target && typeof target === 'object') {
    for (const condition of ['import', 'node', 'default']) {
      const found = exportTarget(target[condition]);
      if (found) return found;
    }
  }
  return undefined;
}

// The package's root entry: `exports` (the `.` subpath, or the sugar form with no subpaths), else `main`.
function launcherEntry(pkg) {
  const exports = pkg.exports;
  if (exports === undefined) return pkg.main ?? 'index.js';
  const root =
    exports && typeof exports === 'object' && !Array.isArray(exports) && Object.keys(exports).some((key) => key.startsWith('.'))
      ? exports['.']
      : exports;
  return exportTarget(root);
}

// The pro launcher's module, found from the project (process.cwd()) first, then from this package; null when absent.
// Only a missing package counts as absent: a launcher that fails to load throws, so a broken install is never skipped.
function loadProLauncher(here) {
  const dir = findProLauncher(process.cwd()) ?? findProLauncher(here);
  if (!dir) return null;
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const entry = launcherEntry(pkg);
  if (!entry) {
    throw new Error(`[mion] ${PRO_LAUNCHER} at ${dir} exports no entry this launcher can load (an import or default path).`);
  }
  // require(esm) loads an ES module synchronously (Node >= 22.12, inside the >= 24 floor).
  return module.createRequire(import.meta.url)(path.join(dir, entry));
}

// Whether a pro launcher is installed for this project, so a caller can skip extension-only work without it.
export function hasProLauncher() {
  return (findProLauncher(process.cwd()) ?? findProLauncher(path.dirname(fileURLToPath(import.meta.url)))) !== null;
}

function ownVersion(here) {
  return JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8')).version;
}

// MION_BIN wins when set; then an installed `@mionkit/pro-bin-compiler` (its mion version must equal ours); then
// the optional dependency `@mionjs/native-compiler-<platform>-<arch>`, or this repo's local `mion-bin/mion`.
export function getExePath() {
  const overridden = overrideExe();
  if (overridden) {
    return process.platform === 'win32' && overridden.length >= 248 ? `\\\\?\\${overridden}` : overridden;
  }

  const here = path.dirname(fileURLToPath(import.meta.url));
  const pro = loadProLauncher(here);
  if (pro) {
    const version = ownVersion(here);
    if (pro.mionVersion !== version) {
      throw new Error(
        `[mion] ${PRO_LAUNCHER} is built on mion ${pro.mionVersion}, but @mionjs/bin-compiler is ${version}. ` +
          `Install the matching pair, or remove ${PRO_LAUNCHER} to use the public binary.`,
      );
    }
    return pro.getExePath();
  }
  const normalized = here.replace(/\\/g, '/');
  const platformKey = `${process.platform}-${process.arch}`;
  const platformPackage = `@mionjs/native-compiler-${platformKey}`;

  // Dev: prefer the locally built binary so the monorepo needs no platform package.
  if (normalized.endsWith('/packages/bin-compiler/lib')) {
    const devExe = path.join(here, '..', '..', '..', 'mion-bin', exeName());
    if (fs.existsSync(devExe)) return devExe;
    // Not built yet — fall through so the thrown error points at the real fix.
  }

  let exeDir;
  try {
    const packageJsonPath = resolvePackageJson(`${platformPackage}/package.json`);
    exeDir = path.join(path.dirname(packageJsonPath), 'lib');
  } catch {
    throw new Error(
      `[mion] Unable to resolve ${platformPackage}. Either your platform/arch ` +
        `(${platformKey}) is unsupported, or its optional dependency was not installed ` +
        `(e.g. install ran with --no-optional / --ignore-optional, or a mirror omits it).`,
    );
  }

  let exe = path.join(exeDir, exeName());
  if (process.platform === 'win32' && exe.length >= 248) exe = `\\\\?\\${exe}`;
  if (!fs.existsSync(exe)) {
    throw new Error(
      `[mion] ${platformPackage} is installed but its binary is missing at ${exe}.`,
    );
  }
  return exe;
}
