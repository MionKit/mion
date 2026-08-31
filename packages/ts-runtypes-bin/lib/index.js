import fs from 'node:fs';
import module from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Basename of the resolver executable inside every platform package's lib/
// directory (and of the locally built dev binary at <repo>/bin/).
const EXE_BASENAME = 'mion';

// Env var that points the launcher at a specific resolver build, overriding
// both lookups below. It is the ONLY escape hatch the lint lane has (the
// bundler plugins additionally take an explicit `binary` option, which wins
// over this), so a consumer can validate an unpublished build, bisect a
// resolver regression, or run a vendored binary in an air-gapped install.
const OVERRIDE_ENV = 'RT_BIN';

function exeName() {
  return process.platform === 'win32' ? `${EXE_BASENAME}.exe` : EXE_BASENAME;
}

// Reads the RT_BIN override, returning null when it is unset or empty (an
// empty value is a no-op rather than an error, so `RT_BIN=` in a .env file
// behaves like not setting it at all). A value that does not name an
// executable file throws instead of falling through to the normal lookups —
// a typo must fail loudly, never silently run a DIFFERENT binary than asked.
function overrideExe() {
  const raw = process.env[OVERRIDE_ENV];
  if (!raw || raw.trim() === '') return null;
  const exe = path.resolve(raw.trim());
  let stats;
  try {
    stats = fs.statSync(exe);
  } catch {
    throw new Error(`[ts-runtypes-bin] ${OVERRIDE_ENV}=${raw} does not exist (resolved to ${exe}).`);
  }
  if (!stats.isFile()) {
    throw new Error(`[ts-runtypes-bin] ${OVERRIDE_ENV}=${raw} is not a file (resolved to ${exe}).`);
  }
  if (process.platform !== 'win32') {
    try {
      fs.accessSync(exe, fs.constants.X_OK);
    } catch {
      throw new Error(`[ts-runtypes-bin] ${OVERRIDE_ENV}=${raw} is not executable (resolved to ${exe}); chmod +x it.`);
    }
  }
  return exe;
}

// Resolves the absolute path of a package's package.json without importing it.
// import.meta.resolve is sync on Node >= 20.6 / 18.19; older runtimes fall back
// to createRequire. We resolve package.json (always present) rather than the
// binary so the lookup never depends on an exports map for the payload file.
function resolvePackageJson(specifier) {
  if (typeof import.meta.resolve === 'function') {
    return fileURLToPath(import.meta.resolve(specifier));
  }
  const require = module.createRequire(import.meta.url);
  return require.resolve(specifier);
}

// Returns the absolute path to the mion resolver binary for the host
// platform. `RT_BIN` wins when set; otherwise, in an installed tree it locates
// the matching optional dependency `@ts-runtypes/binary-<platform>-<arch>`, and
// inside this repo's source tree it falls back to the locally built
// `bin/ts-runtypes`. Throws a clear error when neither is available
// (unsupported platform, or the optional dep was skipped).
export function getExePath() {
  const overridden = overrideExe();
  if (overridden) {
    return process.platform === 'win32' && overridden.length >= 248 ? `\\\\?\\${overridden}` : overridden;
  }

  const here = path.dirname(fileURLToPath(import.meta.url));
  const normalized = here.replace(/\\/g, '/');
  const platformKey = `${process.platform}-${process.arch}`;
  const platformPackage = `@ts-runtypes/binary-${platformKey}`;

  // Dev: running from the workspace source (packages/ts-runtypes-bin/lib) —
  // prefer the locally built binary so the monorepo needs no platform package.
  if (normalized.endsWith('/packages/ts-runtypes-bin/lib')) {
    const devExe = path.join(here, '..', '..', '..', 'bin', exeName());
    if (fs.existsSync(devExe)) return devExe;
    // Not built yet — fall through so the thrown error points at the real fix.
  }

  let exeDir;
  try {
    const packageJsonPath = resolvePackageJson(`${platformPackage}/package.json`);
    exeDir = path.join(path.dirname(packageJsonPath), 'lib');
  } catch {
    throw new Error(
      `[ts-runtypes-bin] Unable to resolve ${platformPackage}. Either your platform/arch ` +
        `(${platformKey}) is unsupported, or its optional dependency was not installed ` +
        `(e.g. install ran with --no-optional / --ignore-optional, or a mirror omits it).`,
    );
  }

  let exe = path.join(exeDir, exeName());
  if (process.platform === 'win32' && exe.length >= 248) exe = `\\\\?\\${exe}`;
  if (!fs.existsSync(exe)) {
    throw new Error(
      `[ts-runtypes-bin] ${platformPackage} is installed but its binary is missing at ${exe}.`,
    );
  }
  return exe;
}
