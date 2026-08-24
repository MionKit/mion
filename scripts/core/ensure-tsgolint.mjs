#!/usr/bin/env node
// ensure-tsgolint.mjs — enforce ts-go-runtypes/tsgolint.pin.json: check the tsgolint
// submodule out to the pinned commit (repairing drift) and (re-)apply the shim
// patches. Idempotent. Setup calls this after the network-sensitive submodule clone;
// it is also runnable standalone as `pnpm rtx core ensure-tsgolint`.
//
//   pnpm rtx core ensure-tsgolint           # ensure + repair the submodule to the pin
//   pnpm rtx core ensure-tsgolint --check    # verify only; non-zero on drift, no mutation
//
// It deliberately does NOT perform the INITIAL submodule clone — that stays in the
// setup scripts, which carry the environment-specific git-proxy bypass. It requires
// an already-initialised submodule and only corrects its revision + patches.

import {loadEnv} from '../lib/env.mjs';
import {die, info, note, reportCliError, success, warn, which} from '../lib/proc.mjs';
import {checkout, describe, ensurePatches, fetchTsgolint, headCommit, PIN_FILE, readPin, rel, submoduleInitialised} from '../lib/tsgolint.mjs';

const short = (sha) => sha.slice(0, 7);
// A full-sha HEAD is at the pin when equal; the startsWith guards a hand-edited short pin.
const atPin = (head, commit) => head === commit || (commit.length < 40 && head.startsWith(commit));

export function main(argv) {
  const checkOnly = argv.includes('--check');
  if (!which('git')) die('ensure-tsgolint: git not found on PATH.', 1);

  const pin = readPin();
  if (!pin) die(`ensure-tsgolint: no pin found — ${rel(PIN_FILE)} is missing or has no "commit".`, 1);
  if (!submoduleInitialised()) {
    die('ensure-tsgolint: tsgolint submodule not initialised. Initialise it first (the ts-runtypes-setup skill, or `git submodule update --init`).', 1);
  }

  const head = headCommit();
  if (atPin(head, pin.commit)) {
    if (checkOnly) return success(`tsgolint at pinned ${pin.ref} (${short(pin.commit)}); patches left untouched (--check).`);
    const patched = ensurePatches();
    return success(`tsgolint at pinned ${pin.ref} (${short(pin.commit)}); patches ${patched.applied} applied, ${patched.already} present.`);
  }

  note(`tsgolint HEAD ${describe()} (${short(head)}) does not match pin ${pin.ref} (${short(pin.commit)}).`);
  if (checkOnly) die('ensure-tsgolint: submodule is NOT at the pinned revision (run `pnpm rtx core ensure-tsgolint` to repair).', 1);

  info(`Checking out pinned ${short(pin.commit)}...`);
  // The pinned commit is usually already local (gitlink == pin, fetched at init);
  // only fetch if the direct checkout can't find it.
  if (!checkout(pin.commit)) {
    warn('pinned commit not present locally — fetching...');
    if (!fetchTsgolint()) die('ensure-tsgolint: git fetch failed (network / remote?).', 1);
    if (!checkout(pin.commit)) die(`ensure-tsgolint: could not check out pinned commit ${pin.commit}.`, 1);
  }
  const patched = ensurePatches();
  success(`Repaired tsgolint to pinned ${pin.ref} (${short(pin.commit)}); patches ${patched.applied} applied, ${patched.already} present.`);
}

if (import.meta.main) {
  loadEnv();
  try {
    main(process.argv.slice(2));
  } catch (err) {
    reportCliError(err);
  }
}
