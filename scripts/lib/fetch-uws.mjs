// fetch-uws.mjs — downloads the uWebSockets.js prebuilt binaries this repo
// mirrors, integrity-checked against the committed manifest.
//
// uWebSockets.js is deliberately NOT on npm; upstream commits the prebuilt
// .node addons into each git tag. This script fetches them file-by-file from
// raw.githubusercontent.com at the tag pinned in packages/uws/package.json
// (`uwsTag`) and verifies every download's sha256 against
// packages/uws/uws-checksums.json BEFORE it is used, so neither dev machines
// nor CI ever trust the network (same posture as the workspace's
// verifyStoreIntegrity / frozenLockfile).
//
// Modes:
//   (default)   dev — fetch ONLY the host's binary (~13 MB) into the gitignored
//               dev cache packages/uws/.uws-cache/<tag>/. Idempotent: a cached
//               file that hashes clean is not re-downloaded. This is what
//               `pnpm miondevx core build uws` (and so the root pretest) runs.
//   --file <n>  fetch exactly this binary (repeatable), for a platform/ABI that is
//               not the host's — the mion-bench container's linux Node 26 one
//   --all       fetch ALL binaries in the manifest + LICENSE into the same
//               cache. Used by scripts/release/build-uws-binaries.mjs to stage
//               the per-platform payload packages.
//   --record    TRUST-ON-FIRST-USE: re-download everything at the pinned tag
//               and REWRITE uws-checksums.json from what the network served.
//               Run this ONLY when bumping `uwsTag`, on a trusted network, and
//               eyeball the diff — after this one moment every later fetch is
//               pinned. Also refresh the supported-matrix tables in
//               packages/uws/lib/index.js and this file's PLATFORMS/ABIS if
//               upstream changed them between tags.
//
// A fetch failure names the URL, the cache path, and the MION_UWS_BINARY_DIR
// escape hatch, so an offline machine knows its options.

import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {loadEnv, REPO_ROOT} from './env.mjs';
import {info, reportCliError, success} from './proc.mjs';
import {UWS_PLATFORMS} from './binary-platforms.mjs';

export const UWS_PKG_DIR = path.join(REPO_ROOT, 'packages', 'uws');
const CHECKSUMS_FILE = path.join(UWS_PKG_DIR, 'uws-checksums.json');
export const UWS_CACHE_DIR = path.join(UWS_PKG_DIR, '.uws-cache');

// Platform-arch pairs (the shared UWS_PLATFORMS list, in upstream's file-name
// spelling) and the Node ABIs the pinned tag ships. Keep the ABIs in lockstep
// with ABI_TO_NODE_MAJOR in packages/uws/lib/index.js.
const PLATFORMS = UWS_PLATFORMS.map((platform) => `${platform.os}_${platform.cpu}`);
const ABIS = ['127', '137', '147'];
export const UWS_LICENSE_FILE = 'LICENSE';

export function readUwsTag() {
  const manifest = JSON.parse(fs.readFileSync(path.join(UWS_PKG_DIR, 'package.json'), 'utf8'));
  if (!manifest.uwsTag) throw new Error('packages/uws/package.json has no uwsTag pin.');
  return manifest.uwsTag;
}

// The binaries of ONE platform (every Node ABI), what a host-only staging fetches.
export function uwsFilesFor(platform) {
  return ABIS.map((abi) => `uws_${platform.os}_${platform.cpu}_${abi}.node`);
}

// Every file the mirror needs: 15 binaries + the upstream Apache-2.0 LICENSE.
export function allUwsFiles() {
  const files = [];
  for (const platform of PLATFORMS) for (const abi of ABIS) files.push(`uws_${platform}_${abi}.node`);
  files.push(UWS_LICENSE_FILE);
  return files;
}

function hostBinaryFile() {
  return `uws_${process.platform}_${process.arch}_${process.versions.modules}.node`;
}

function rawUrl(tag, file) {
  return `https://raw.githubusercontent.com/uNetworking/uWebSockets.js/${tag}/${file}`;
}

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

function readChecksums() {
  if (!fs.existsSync(CHECKSUMS_FILE)) {
    throw new Error(`${path.relative(REPO_ROOT, CHECKSUMS_FILE)} is missing — run \`node scripts/lib/fetch-uws.mjs --record\` on a trusted network to regenerate it.`);
  }
  return JSON.parse(fs.readFileSync(CHECKSUMS_FILE, 'utf8'));
}

async function download(tag, file) {
  const url = rawUrl(tag, file);
  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new Error(
      `Could not download ${url} (${err.cause?.code || err.message}). Offline or blocked? ` +
        `Either restore network access, or vendor the binary and point MION_UWS_BINARY_DIR at its directory ` +
        `(expected cache location: ${path.relative(REPO_ROOT, path.join(UWS_CACHE_DIR, tag, file))}).`,
    );
  }
  if (!response.ok) throw new Error(`Download of ${url} failed with HTTP ${response.status}.`);
  return Buffer.from(await response.arrayBuffer());
}

// True when the cached copy exists and hashes clean; a corrupt/stale file is
// removed so the caller re-downloads it.
function cachedIsValid(cachedFile, expectedHash) {
  if (!fs.existsSync(cachedFile)) return false;
  if (sha256(fs.readFileSync(cachedFile)) === expectedHash) return true;
  fs.rmSync(cachedFile);
  return false;
}

async function fetchVerified(tag, file, expectedHash) {
  const cacheDir = path.join(UWS_CACHE_DIR, tag);
  const cachedFile = path.join(cacheDir, file);
  if (cachedIsValid(cachedFile, expectedHash)) return cachedFile;
  if (!expectedHash) {
    throw new Error(`uws-checksums.json (tag ${tag}) has no entry for ${file} — regenerate it with --record when bumping the tag.`);
  }
  const buffer = await download(tag, file);
  const actualHash = sha256(buffer);
  if (actualHash !== expectedHash) {
    throw new Error(`sha256 mismatch for ${rawUrl(tag, file)}: expected ${expectedHash}, got ${actualHash}. Refusing to use it.`);
  }
  fs.mkdirSync(cacheDir, {recursive: true});
  fs.writeFileSync(cachedFile, buffer);
  return cachedFile;
}

/**
 * Ensures the uWS binaries are in the dev cache, verified. Returns the cache
 * dir for the pinned tag. `all: true` fetches the full mirror set (+ LICENSE);
 * `only` fetches exactly the named files (what the mion-bench container needs: the
 * LINUX binary for the image's Node ABI, which is not the host's); the default
 * fetches only the host's own binary.
 */
export async function ensureUwsBinaries({all = false, only = []} = {}) {
  const tag = readUwsTag();
  const checksums = readChecksums();
  if (checksums.tag !== tag) {
    throw new Error(`uws-checksums.json is for tag ${checksums.tag} but package.json pins ${tag} — run --record to regenerate it.`);
  }
  const files = all ? allUwsFiles() : only.length > 0 ? only : [hostBinaryFile()];
  for (const file of files) {
    if (all || checksums.files[file]) {
      await fetchVerified(tag, file, checksums.files[file]);
    } else if (only.length > 0) {
      // An explicitly requested file that the manifest does not know is a caller
      // error (a typo'd triple, or an ABI the pinned tag never shipped), not a host
      // the project happens not to support — so say so instead of silently skipping.
      throw new Error(`fetch-uws: ${file} is not in uws-checksums.json for ${tag} — check the platform/ABI, or regenerate the manifest with --record.`);
    } else {
      // Host triple not in the manifest: the loader's own support-matrix error
      // is clearer than a download 404, so leave the cache empty here.
      info(`fetch-uws: no ${file} at ${tag} (unsupported host for uWS) — skipping fetch.`);
    }
  }
  return path.join(UWS_CACHE_DIR, tag);
}

// TRUST-ON-FIRST-USE moment: download everything and rewrite the manifest.
async function record() {
  const tag = readUwsTag();
  const files = {};
  for (const file of allUwsFiles()) {
    info(`recording ${file}...`);
    const buffer = await download(tag, file);
    files[file] = sha256(buffer);
    // Keep the download so a follow-up --all is a no-op.
    const cacheDir = path.join(UWS_CACHE_DIR, tag);
    fs.mkdirSync(cacheDir, {recursive: true});
    fs.writeFileSync(path.join(cacheDir, file), buffer);
  }
  fs.writeFileSync(CHECKSUMS_FILE, JSON.stringify({tag, files}, null, 2) + '\n');
  success(`Recorded ${Object.keys(files).length} sha256 hashes for ${tag} into ${path.relative(REPO_ROOT, CHECKSUMS_FILE)}.`);
}

export async function main(args) {
  if (args.includes('--record')) return record();
  const all = args.includes('--all');
  // --file <name> (repeatable): fetch exactly these, whatever the host is. The
  // mion-bench image runs Node 26 (ABI 147) on linux, so its binary is never the one
  // a developer's host needs, and pulling all 15 to get it wastes ~200 MB.
  const only = args.flatMap((arg, i) => (arg === '--file' && args[i + 1] ? [args[i + 1]] : []));
  const cacheDir = await ensureUwsBinaries({all, only});
  const what = all ? 'all platforms' : only.length > 0 ? only.join(', ') : 'host only';
  success(`uWS binaries ready (${what}) in ${path.relative(REPO_ROOT, cacheDir)}/.`);
}

if (import.meta.main) {
  loadEnv();
  main(process.argv.slice(2)).catch(reportCliError);
}
