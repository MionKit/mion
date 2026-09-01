// Rule-thread half of the lint session: a synchronous facade over the async
// resolver, using the worker-thread + Atomics.wait bridge (see
// lint-worker.ts). Lint rule visitors are synchronous, so the rule thread
// posts a request to the worker and BLOCKS on a SharedArrayBuffer until the
// worker signals the response is queued — the standard sync-over-async
// pattern (synckit-style), hand-rolled so the plugin adds no dependencies.
//
// One session serves the whole lint run; per-(file, text-hash) results are
// memoized so the several rules that share a file's single resolver pass pay
// for it once, and unchanged files replay instantly on the next run of a
// long-lived host (the oxlint LSP).
//
// The worker starts at PLUGIN LOAD (prewarmSession, called from index.ts):
// it must pre-spawn the resolver launcher while the host process is still
// small enough to fork — see the spawn-shim rationale in lint-worker.ts.
// MION_LINT_PRESPAWN=0 opts out of both the prewarm and the shim.

import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {MessageChannel, receiveMessageOnPort, Worker, type MessagePort} from 'node:worker_threads';
import type {Diagnostic} from '../protocol.ts';
import {readEnvCompat} from '../envCompat.ts';
import {WAKE_INDEX, type LintSessionOptions, type LintWorkerRequest, type LintWorkerResponse} from './session-protocol.ts';

export type {LintSessionOptions} from './session-protocol.ts';

// LintOutcome is one file's result: the wire diagnostics, or the reason the
// engine could not answer (reported, never silently swallowed).
export type LintOutcome = {diagnostics: Diagnostic[]} | {engineError: string};

const DEFAULT_TIMEOUT_MS = 60_000;
const CACHE_CAP = 256;

export class LintSession {
  private worker: Worker | null = null;
  private requestPort: MessagePort | null = null;
  private signal = new Int32Array(new SharedArrayBuffer(4));
  private seq = 0;
  private readonly cache = new Map<string, LintOutcome>();
  // Sticky engine failure: once the bridge is known-broken (worker failure,
  // timeout), every later file reports the same reason instead of re-paying
  // the timeout.
  private dead: string | null = null;

  // start eagerly creates the worker and resolves once it has pre-spawned
  // the resolver launcher (its shimReady signal) — the plugin entry awaits
  // this at load so the launcher fork deterministically precedes the host's
  // memory ramp. Resolves (never rejects) on worker failure or after a short
  // grace timeout; the failure then surfaces per-file as an engine error.
  start(): Promise<void> {
    let worker: Worker;
    try {
      this.ensureWorker();
      worker = this.worker!;
    } catch (error) {
      this.dead = error instanceof Error ? error.message : String(error);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, 2000);
      timer.unref?.();
      worker.once('message', () => {
        clearTimeout(timer);
        resolve();
      });
      worker.once('error', (error) => {
        this.dead = `lint worker failed: ${error instanceof Error ? error.message : String(error)}`;
        clearTimeout(timer);
        resolve();
      });
    });
  }

  // lintFileSync runs the single resolver pass for one file's buffer text and
  // returns its diagnostics (all families — the caller routes them to rules).
  // options carries the per-file timeout budget, the project tsconfig and an
  // optional resolver binary; the working directory is process.cwd(), never
  // configurable. The tsconfig and binary only take effect on the FIRST file of a
  // run, which is when the worker opens its long-lived connection.
  lintFileSync(file: string, text: string, options: LintSessionOptions = {}): LintOutcome {
    const key = `${file} ${createHash('sha1').update(text).digest('base64')}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const outcome = this.dead ? {engineError: this.dead} : this.roundTrip(file, text, options);
    this.remember(key, outcome);
    return outcome;
  }

  private remember(key: string, outcome: LintOutcome): void {
    if (this.cache.size >= CACHE_CAP) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, outcome);
  }

  private roundTrip(file: string, text: string, options: LintSessionOptions): LintOutcome {
    let port: MessagePort;
    try {
      port = this.ensureWorker();
    } catch (error) {
      this.dead = error instanceof Error ? error.message : String(error);
      return {engineError: this.dead};
    }

    const seq = ++this.seq;
    // Forward ONLY an explicit tsconfig setting (strict: the daemon fails the
    // op when it is missing or broken). When unset, the Go side resolves the
    // config exactly as tsc does — searching upward from cwd — mirroring the
    // bundler plugins; the lint session carries no config logic of its own.
    port.postMessage({
      seq,
      file,
      text,
      tsconfig: options.tsconfig ?? '',
      binary: options.binary ?? '',
    } satisfies LintWorkerRequest);

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;
    // Block until the worker has stored our seq (it posts the response BEFORE
    // notifying, so once the signal reaches seq the message is in the queue).
    for (;;) {
      const current = Atomics.load(this.signal, WAKE_INDEX);
      if (current >= seq) break;
      const remaining = deadline - Date.now();
      if (remaining <= 0 || Atomics.wait(this.signal, WAKE_INDEX, current, remaining) === 'timed-out') {
        this.dead = `resolver did not answer within ${timeoutMs}ms (file: ${file})`;
        return {engineError: this.dead};
      }
    }

    // Drain the port for our response (requests are strictly sequential, so
    // the next message is ours; the loop guards a stale leftover anyway).
    for (;;) {
      const received = receiveMessageOnPort(port) as {message: LintWorkerResponse} | undefined;
      if (!received) {
        this.dead = `resolver signalled seq ${seq} but no response message arrived`;
        return {engineError: this.dead};
      }
      if (received.message.seq !== seq) continue;
      if (received.message.error) {
        const engineError = `resolver failed: ${received.message.error}`;
        // Connection-level failures stick: later files answer instantly
        // instead of re-paying a dead engine. Per-file op errors don't.
        if (received.message.fatal) this.dead = engineError;
        return {engineError};
      }
      return {diagnostics: received.message.diagnostics ?? []};
    }
  }

  private ensureWorker(): MessagePort {
    if (this.requestPort) return this.requestPort;
    const {port1, port2} = new MessageChannel();
    this.worker = new Worker(resolveWorkerURL(), {
      name: 'runtypes-lint-resolver',
      workerData: {port: port2, signal: this.signal},
      transferList: [port2],
    });
    // The worker must never keep the host process alive after the run; when
    // the process exits, the worker dies and its resolver child reads EOF and
    // exits too.
    this.worker.unref();
    this.requestPort = port1;
    return port1;
  }

  // dispose tears the bridge down (tests; hosts rely on process exit).
  dispose(): void {
    this.worker?.postMessage({close: true});
    void this.worker?.terminate();
    this.worker = null;
    this.requestPort = null;
    this.cache.clear();
    this.dead = null;
  }
}

// resolveWorkerURL finds the worker ENTRY FILE. Running from dist (the
// published package, the normal case) the sibling .js exists. Running from
// src (this repo's vitest, which imports source), the worker must still be a
// real on-disk .js — a worker thread loads its file through plain Node, not
// through vite's transform — so fall back to the built dist twin (the repo's
// stale-build check keeps dist fresh).
function resolveWorkerURL(): URL {
  const sibling = new URL('./lint-worker.js', import.meta.url);
  if (existsSync(fileURLToPath(sibling))) return sibling;
  const dist = new URL('../../dist/eslint/lint-worker.js', import.meta.url);
  if (existsSync(fileURLToPath(dist))) return dist;
  throw new Error(
    '[runtypes] lint worker not found — build @ts-runtypes/devtools first (pnpm --filter @ts-runtypes/devtools run build)'
  );
}

// sharedSession returns the module-level session every rule shares.
let shared: LintSession | null = null;

export function sharedSession(): LintSession {
  if (!shared) shared = new LintSession();
  return shared;
}

// prewarmSession starts the shared session's worker at plugin load so the
// resolver launcher forks while the host is still small (see lint-worker.ts).
// The plugin entry top-level-awaits the returned promise. MION_LINT_PRESPAWN=0
// turns the eager start off; the session then starts on the first linted
// file (fine for small hosts like plain ESLint).
export function prewarmSession(): Promise<void> {
  if (readEnvCompat('MION_LINT_PRESPAWN') === '0') return Promise.resolve();
  return sharedSession().start();
}

// resetSharedSession disposes the shared session (tests only).
export function resetSharedSession(): void {
  shared?.dispose();
  shared = null;
}
