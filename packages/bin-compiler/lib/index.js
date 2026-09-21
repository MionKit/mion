import fs from 'node:fs';
import module from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Basename inside every platform package's lib/, and of the dev binary at <repo>/mion-bin/.
const EXE_BASENAME = 'mion';

// Points the launcher at a specific resolver build, overriding both lookups below, and the ONLY
// escape hatch the lint lane has; a bundler plugin's explicit `binary` option still wins over it.
const OVERRIDE_ENV = 'MION_BIN';

// The pre-MION_ spelling, still READ so an existing setup keeps working, and warned about once:
// silently ignoring a path someone set would run a different binary than they asked for.
const LEGACY_OVERRIDE_ENV = 'RT_BIN';
let legacyOverrideNoticeShown = false;

function exeName() {
  return process.platform === 'win32' ? `${EXE_BASENAME}.exe` : EXE_BASENAME;
}

function overrideRaw() {
  const current = process.env[OVERRIDE_ENV];
  if (current && current.trim() !== '') return current;
  const legacy = process.env[LEGACY_OVERRIDE_ENV];
  if (!legacy || legacy.trim() === '') return legacy;
  if (!legacyOverrideNoticeShown) {
    legacyOverrideNoticeShown = true;
    console.warn(
      `[mion] ${LEGACY_OVERRIDE_ENV} is deprecated and will be removed. ` +
        `Rename it to ${OVERRIDE_ENV}; it is still being honoured for now.`
    );
  }
  return legacy;
}

// An empty value is a no-op, so `MION_BIN=` in a .env behaves like not setting it at all.
// A value that names no executable throws instead of falling through: a typo must fail loudly.
function overrideExe() {
  const raw = overrideRaw();
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

// import.meta.resolve is sync on Node >= 20.6 / 18.19; createRequire is the older-runtime fallback.
// package.json rather than the binary, so the lookup never depends on an exports map.
function resolvePackageJson(specifier) {
  if (typeof import.meta.resolve === 'function') {
    return fileURLToPath(import.meta.resolve(specifier));
  }
  const require = module.createRequire(import.meta.url);
  return require.resolve(specifier);
}

// MION_BIN wins when set; an installed tree resolves the optional dependency
// `@mionjs/native-compiler-<platform>-<arch>`, this repo's source tree the local `mion-bin/mion`.
export function getExePath() {
  const overridden = overrideExe();
  if (overridden) {
    return process.platform === 'win32' && overridden.length >= 248 ? `\\\\?\\${overridden}` : overridden;
  }

  const here = path.dirname(fileURLToPath(import.meta.url));
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
