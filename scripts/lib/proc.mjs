// proc.mjs — shared process + logging helpers for the rt area modules. Zero-dep
// (node: built-ins only). Replaces the shell scripts' hand-rolled ANSI vars, the
// `command -v` probes, and the `die()`/`info()`/`success()` helpers duplicated
// across build.sh / lib.sh / bench.sh / image.sh.
//
// Contract: leaves never call
// process.exit — they throw a CliError via die(); rt.mjs catches it, prints, and
// sets process.exitCode. Anything that isn't a CliError rethrows (a real bug).

import {spawn, spawnSync} from 'node:child_process';
import {accessSync, constants} from 'node:fs';
import {arch} from 'node:os';
import {delimiter, join} from 'node:path';
import {createInterface} from 'node:readline/promises';
import {styleText} from 'node:util';
import {REPO_ROOT} from './env.mjs';

// A CliError carries an exit code; rt.mjs prints its message + sets process.exitCode.
export class CliError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.name = 'CliError';
    this.code = code;
  }
}

// Throw a tagged failure. Leaves call this instead of process.exit; the message is
// printed by the top-level handler and the code becomes the process exit code.
// Convention: include an area prefix (e.g. 'core build: …', 'bench: …'), mirroring
// the shell scripts' `die() { echo "${0##*/}: $*"; }`.
export function die(message, code = 1) {
  throw new CliError(message, code);
}

// Top-level handler for rt.mjs dispatch AND each leaf's direct-invocation footer:
// print a CliError's message (if any) to stderr and set the exit code; rethrow
// anything else (a real bug) so it surfaces with a stack.
export function reportCliError(err) {
  if (err instanceof CliError) {
    if (err.message) console.error(err.message);
    process.exitCode = err.code;
    return;
  }
  throw err;
}

// ── colored logging ─────────────────────────────────────────────────────────
// styleText auto-disables color on NO_COLOR / non-TTY / a piped stream (it reads
// the stream we hand it), so these are safe in CI logs and when piped.
const paint = (format, text, stream) => styleText(format, text, {stream});
export const green = (text) => paint('green', text, process.stdout);
export const red = (text) => paint('red', text, process.stdout);
export const yellow = (text) => paint('yellow', text, process.stdout);
export const dim = (text) => paint('dim', text, process.stdout);

// build.sh's info/success/fail vocabulary (info -> stdout yellow, success -> stdout
// green "OK", warn -> stderr yellow "==> WARN"). note()/noteErr() are the plain
// `==>` progress lines image.sh / site.sh / bench.sh print.
export const info = (msg) => console.log(paint('yellow', `-> ${msg}`, process.stdout));
export const success = (msg) => console.log(paint('green', `OK ${msg}`, process.stdout));
export const warn = (msg) => console.error(paint('yellow', `==> WARN: ${msg}`, process.stderr));
export const note = (msg) => console.log(`==> ${msg}`);
export const noteErr = (msg) => console.error(`==> ${msg}`);

// ── spawning external tools ─────────────────────────────────────────────────
// Merge env WITHOUT clobbering it via the opts spread; cwd defaults to the repo
// root (every shell script `cd`s there first).
function spawnOpts({env, ...opts}) {
  return {cwd: REPO_ROOT, ...opts, env: env ? {...process.env, ...env} : process.env};
}

// Run one command to completion with stdio inherited; return its exit code.
export function run(cmd, args = [], opts = {}) {
  const result = spawnSync(cmd, args, {stdio: 'inherit', ...spawnOpts(opts)});
  if (result.error) die(`failed to launch ${cmd}: ${result.error.message}`);
  return typeof result.status === 'number' ? result.status : 1;
}

// Async twin of run() for work that must OVERLAP (the parallel two-site website
// build): spawns with piped stdio, prefixes every output line with `[prefix] ` so
// two interleaved logs stay readable, and resolves with the exit code. A launch
// failure rejects with a CliError, the way run() dies.
export function runAsync(cmd, args = [], {prefix = '', ...opts} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {stdio: ['ignore', 'pipe', 'pipe'], ...spawnOpts(opts)});
    const tag = prefix ? `[${prefix}] ` : '';
    const forward = (stream, out) => {
      let rest = '';
      stream.setEncoding('utf8');
      stream.on('data', (chunk) => {
        rest += chunk;
        const lines = rest.split('\n');
        rest = lines.pop();
        for (const line of lines) out.write(`${tag}${line}\n`);
      });
      stream.on('end', () => {
        if (rest) out.write(`${tag}${rest}\n`);
      });
    };
    forward(child.stdout, process.stdout);
    forward(child.stderr, process.stderr);
    child.on('error', (err) => reject(new CliError(`failed to launch ${cmd}: ${err.message}`)));
    child.on('close', (code) => resolve(typeof code === 'number' ? code : 1));
  });
}

// Run one command; throw CliError with its exit code on any non-zero result.
export function runOrThrow(cmd, args = [], opts = {}) {
  const code = run(cmd, args, opts);
  if (code !== 0) die(opts.failMessage ?? `${cmd} exited with code ${code}`, code);
}

// Run one command capturing stdout/stderr as UTF-8 (never inherits). Returns
// {status, stdout, stderr, error}; callers .trim() as needed. Never throws.
export function capture(cmd, args = [], opts = {}) {
  const result = spawnSync(cmd, args, {encoding: 'utf8', ...spawnOpts(opts)});
  return {status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '', error: result.error};
}

// PATH probe (the `command -v x` replacement): the resolved path if `cmd` is an
// executable on PATH, else null.
export function which(cmd) {
  const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  const exts = process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';') : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      const full = join(dir, cmd + ext);
      try {
        accessSync(full, constants.X_OK);
        return full;
      } catch {
        // not here; keep probing
      }
    }
  }
  return null;
}

// Small async sleep for poll loops (fetch-based smoke waits).
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Interactive line prompt (the `read -rp "…" VAR` replacement); returns the trimmed
// answer. Opens + closes a fresh readline interface per call.
export async function prompt(question) {
  const rl = createInterface({input: process.stdin, output: process.stdout});
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

// Host architecture as a Go/OCI arch string (amd64 | arm64) — the `uname -m` case
// the shell scripts ran (x86_64|amd64 -> amd64, arm64|aarch64 -> arm64, else amd64).
// node's os.arch() is already normalized (x64 -> amd64, arm64 stays arm64).
export function hostGoArch() {
  return arch() === 'arm64' ? 'arm64' : 'amd64';
}
