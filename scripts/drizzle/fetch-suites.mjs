// fetch-suites.mjs — download drizzle's own integration-test suites, pinned and
// integrity-checked, so the drizzle-e2e lane can translate and run them.
//
// The lane (container/drizzle-e2e/) proves that a toDrizzle() table works against a
// real database by running the tests drizzle already trusts: ~500 driver-agnostic
// cases in tests/<dialect>/<dialect>-common.ts. Those files are NOT published to
// npm — the integration-tests package is private — so they are fetched file-by-file
// from raw.githubusercontent.com at the tag pinned in drizzle-suites.pin.json and
// every download's sha256 is verified BEFORE it is used. Same posture as
// scripts/lib/fetch-uws.mjs: neither dev machines nor CI ever trust the network.
//
// Nothing fetched here is committed. The extracted tree lives in the gitignored
// cache at .cache/drizzle-suites/<tag>/, laid out so drizzle's own `~/` path alias
// resolves:
//
//   .cache/drizzle-suites/0.45.2/
//     LICENSE                      upstream Apache-2.0, kept with the tree
//     NOTICE.md                    what this is and where it came from
//     tests/common.ts              skipTests()
//     tests/utils.ts               randomString(), Expect(), Equal<>
//     tests/pg/pg-common.ts
//     tests/mysql/mysql-common.ts
//     tests/sqlite/sqlite-common.ts
//
// Modes:
//   (default)   fetch + verify every pinned file into the cache. Idempotent: a
//               cached file that hashes clean is not re-downloaded.
//   --record    TRUST-ON-FIRST-USE: re-download everything at the pinned tag and
//               REWRITE the checksums in drizzle-suites.pin.json from what the
//               network served. Run this ONLY when bumping the tag, on a trusted
//               network, and eyeball the diff.
//   --check     verify the pin agrees with the installed drizzle-orm and that the
//               cache is clean, without downloading anything new.
//
// The pin's `drizzleOrm` MUST equal the workspace's installed drizzle-orm version.
// The suites test the authoring surface our packages mirror; running last release's
// tests against this release's recorders would prove nothing, so the mismatch is a
// hard error rather than a warning.

import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {installedDrizzleVersion} from '../lib/drizzle-line.mjs';
import {loadEnv, REPO_ROOT} from '../lib/env.mjs';
import {info, reportCliError, success} from '../lib/proc.mjs';

export const PIN_FILE = path.join(REPO_ROOT, 'drizzle-suites.pin.json');
export const SUITES_CACHE_DIR = path.join(REPO_ROOT, '.cache', 'drizzle-suites');

// Every file the lane needs, as its path inside the drizzle repo. The three
// <dialect>-common.ts files are the suites themselves; common.ts and utils.ts are
// the helpers they import through the `~/` alias. Drizzle's own runners
// (node-postgres.test.ts and friends) are deliberately NOT here: they carry
// top-level migrator tests skipTests cannot reach and import per-dialect cache
// suites we do not run, so the lane writes its own thin runners instead
// (container/drizzle-e2e/shared/runners/).
const SUITE_FILES = [
  'integration-tests/tests/common.ts',
  'integration-tests/tests/utils.ts',
  'integration-tests/tests/pg/pg-common.ts',
  'integration-tests/tests/mysql/mysql-common.ts',
  'integration-tests/tests/sqlite/sqlite-common.ts',
  // The Durable Objects suite is shaped nothing like the others: instead of a
  // `tests()` function a vitest runner calls, it is a WORKER — a Durable Object
  // class whose every method is one test, driven by a fetch handler. The lane runs
  // it the way drizzle runs it (see container/drizzle-e2e/shared/runners/durable.mjs);
  // what matters for the translation is that its schema is declared with plain
  // sqlite-core builders, exactly like the other suites. Its drizzle-kit migration
  // rides along because the suite's migrate1() test applies it.
  'integration-tests/tests/sqlite/durable-objects/index.ts',
  'integration-tests/tests/sqlite/durable-objects/drizzle/migrations.js',
  'integration-tests/tests/sqlite/durable-objects/drizzle/0000_cuddly_black_bolt.sql',
  'integration-tests/tests/sqlite/durable-objects/drizzle/meta/_journal.json',
];

// The upstream licence rides along with the extracted tree.
const LICENSE_FILE = 'LICENSE';
const ALL_FILES = [...SUITE_FILES, LICENSE_FILE];

// Where one repo path lands inside the cache: the suites lose the
// `integration-tests/` prefix so `tests/` is the `~/` alias root, everything else
// keeps its name.
function cachePathFor(repoPath) {
  return repoPath.startsWith('integration-tests/') ? repoPath.slice('integration-tests/'.length) : repoPath;
}

function rawUrl(tag, repoPath) {
  return `https://raw.githubusercontent.com/drizzle-team/drizzle-orm/${tag}/${repoPath}`;
}

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

export function readPin() {
  if (!fs.existsSync(PIN_FILE)) {
    throw new Error(`${path.relative(REPO_ROOT, PIN_FILE)} is missing — run \`pnpm rtx core drizzle-suites --record\` on a trusted network to regenerate it.`);
  }
  return JSON.parse(fs.readFileSync(PIN_FILE, 'utf8'));
}

// The pin and the workspace must describe the same drizzle release.
function assertPinMatchesInstalled(pin) {
  const installed = installedDrizzleVersion(REPO_ROOT);
  if (pin.drizzleOrm === installed) return;
  throw new Error(
    `drizzle-suites.pin.json is for drizzle-orm ${pin.drizzleOrm} but the workspace installs ${installed}. ` +
      'Bump the pin\'s tag + drizzleOrm together and re-record it (`pnpm rtx core drizzle-suites --record`): ' +
      'the suites must test the same authoring surface the packages mirror.'
  );
}

async function download(tag, repoPath) {
  const url = rawUrl(tag, repoPath);
  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new Error(
      `Could not download ${url} (${err.cause?.code || err.message}). Offline or blocked? ` +
        `Restore network access, or vendor the file into ${path.relative(REPO_ROOT, path.join(SUITES_CACHE_DIR, tag, cachePathFor(repoPath)))}.`
    );
  }
  if (!response.ok) throw new Error(`Download of ${url} failed with HTTP ${response.status}.`);
  return Buffer.from(await response.arrayBuffer());
}

// True when the cached copy exists and hashes clean; a corrupt or stale file is
// removed so the caller re-downloads it.
function cachedIsValid(cachedFile, expectedHash) {
  if (!fs.existsSync(cachedFile)) return false;
  if (sha256(fs.readFileSync(cachedFile)) === expectedHash) return true;
  fs.rmSync(cachedFile);
  return false;
}

async function fetchVerified(tag, repoPath, expectedHash) {
  const cachedFile = path.join(SUITES_CACHE_DIR, tag, cachePathFor(repoPath));
  if (cachedIsValid(cachedFile, expectedHash)) return cachedFile;
  if (!expectedHash) {
    throw new Error(`drizzle-suites.pin.json (tag ${tag}) has no entry for ${repoPath} — regenerate it with --record when bumping the tag.`);
  }
  const buffer = await download(tag, repoPath);
  const actualHash = sha256(buffer);
  if (actualHash !== expectedHash) {
    throw new Error(`sha256 mismatch for ${rawUrl(tag, repoPath)}: expected ${expectedHash}, got ${actualHash}. Refusing to use it.`);
  }
  fs.mkdirSync(path.dirname(cachedFile), {recursive: true});
  fs.writeFileSync(cachedFile, buffer);
  return cachedFile;
}

// Provenance note written beside the extracted tree, so a copy of the cache that
// travels (into a container, into a bug report) still says what it is.
function writeNotice(tag, dir) {
  const notice =
    `# Vendored drizzle integration suites\n\n` +
    `Fetched by scripts/drizzle/fetch-suites.mjs from drizzle-team/drizzle-orm at tag \`${tag}\`,\n` +
    `sha256-verified against drizzle-suites.pin.json. Not part of this repository and never committed.\n\n` +
    `Upstream is Apache-2.0; the licence sits beside this file as LICENSE.\n\n` +
    `The drizzle-e2e lane translates these onto the @mionjs/drizzle-orm-* packages and runs them\n` +
    `against a real database, so drizzle's own tests prove the translation.\n`;
  fs.writeFileSync(path.join(dir, 'NOTICE.md'), notice);
}

/**
 * Ensures the pinned suites are in the cache, verified, and returns the extracted
 * tree's directory. Idempotent: a clean cache re-verifies without downloading.
 */
export async function ensureDrizzleSuites() {
  const pin = readPin();
  assertPinMatchesInstalled(pin);
  for (const repoPath of ALL_FILES) await fetchVerified(pin.tag, repoPath, pin.files[repoPath]);
  const dir = path.join(SUITES_CACHE_DIR, pin.tag);
  writeNotice(pin.tag, dir);
  return dir;
}

// Verify-only: the pin agrees with the workspace and every cached file hashes
// clean. Never downloads, so it is safe in an offline pre-commit.
function check() {
  const pin = readPin();
  assertPinMatchesInstalled(pin);
  const missing = [];
  for (const repoPath of ALL_FILES) {
    const cachedFile = path.join(SUITES_CACHE_DIR, pin.tag, cachePathFor(repoPath));
    if (!cachedIsValid(cachedFile, pin.files[repoPath])) missing.push(repoPath);
  }
  if (missing.length > 0) {
    throw new Error(`${missing.length} pinned file(s) are missing or stale in the cache — run \`pnpm rtx core drizzle-suites\`:\n  ${missing.join('\n  ')}`);
  }
  success(`drizzle suites pinned at ${pin.tag} (drizzle-orm ${pin.drizzleOrm}) and cached clean.`);
}

// TRUST-ON-FIRST-USE moment: download everything and rewrite the pin.
async function record() {
  const pin = readPin();
  const files = {};
  for (const repoPath of ALL_FILES) {
    info(`recording ${repoPath}...`);
    const buffer = await download(pin.tag, repoPath);
    files[repoPath] = sha256(buffer);
    const cachedFile = path.join(SUITES_CACHE_DIR, pin.tag, cachePathFor(repoPath));
    fs.mkdirSync(path.dirname(cachedFile), {recursive: true});
    fs.writeFileSync(cachedFile, buffer);
  }
  fs.writeFileSync(PIN_FILE, `${JSON.stringify({...pin, files}, null, 2)}\n`);
  writeNotice(pin.tag, path.join(SUITES_CACHE_DIR, pin.tag));
  success(`Recorded ${Object.keys(files).length} sha256 hashes for ${pin.tag} into ${path.relative(REPO_ROOT, PIN_FILE)}.`);
}

export async function main(args) {
  if (args.includes('--record')) return record();
  if (args.includes('--check')) return check();
  const dir = await ensureDrizzleSuites();
  success(`drizzle suites ready in ${path.relative(REPO_ROOT, dir)}/.`);
}

if (import.meta.main) {
  loadEnv();
  main(process.argv.slice(2)).catch(reportCliError);
}
