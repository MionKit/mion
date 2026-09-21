// Rule-thread half of the lint session: lint rule visitors are synchronous, so the rule thread posts to the
// worker (lint-worker.ts) and BLOCKS on a SharedArrayBuffer until the response is queued, the sync-over-async
// pattern hand-rolled so the plugin adds no dependencies. One session serves the whole run, memoized per
// (file, text hash) so the several rules sharing a file's single resolver pass pay once and unchanged files
// replay instantly in a long-lived host (the oxlint LSP). The worker starts at PLUGIN LOAD (prewarmSession,
// called from index.ts) to pre-spawn the resolver launcher while the host is still small enough to fork;
// MION_LINT_PRESPAWN=0 opts out of both the prewarm and the shim.

import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {MessageChannel, receiveMessageOnPort, Worker, type MessagePort} from 'node:worker_threads';
import type {Diagnostic} from '../core/protocol.ts';
import {readEnvCompat} from '../core/envCompat.ts';
import {WAKE_INDEX, type LintSessionOptions, type LintWorkerRequest, type LintWorkerResponse} from './session-protocol.ts';

export type {LintSessionOptions} from './session-protocol.ts';

// LintOutcome is one file's result: the wire diagnostics, or the reason the engine could not answer.
export type LintOutcome = {diagnostics: Diagnostic[]} | {engineError: string};

const DEFAULT_TIMEOUT_MS = 60_000;
const CACHE_CAP = 256;

export class LintSession {
  private worker: Worker | null = null;
  private requestPort: MessagePort | null = null;
  private signal = new Int32Array(new SharedArrayBuffer(4));
  private seq = 0;
  private readonly cache = new Map<string, LintOutcome>();
  // Sticky engine failure: once the bridge is known-broken, later files reuse the reason instead of re-paying it.
  private dead: string | null = null;

  // start resolves once the worker signals shimReady; the plugin entry awaits it at load so the launcher fork
  // precedes the host's memory ramp. Never rejects: on worker failure or grace timeout it surfaces per file.
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

  // lintFileSync runs one file's single resolver pass and returns every family's diagnostics; the caller routes
  // them. The working directory is always process.cwd(); tsconfig and binary only apply on the run's FIRST file,
  // which is when the worker opens its long-lived connection.
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
    // Forward ONLY an explicit tsconfig (strict: the daemon fails the op when it is missing or broken). Unset,
    // the Go side searches upward from cwd exactly as tsc does, so this side carries no config logic.
    port.postMessage({
      seq,
      file,
      text,
      tsconfig: options.tsconfig ?? '',
      binary: options.binary ?? '',
    } satisfies LintWorkerRequest);

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;
    // The worker posts the response BEFORE notifying, so once the signal reaches seq the message is queued.
    for (;;) {
      const current = Atomics.load(this.signal, WAKE_INDEX);
      if (current >= seq) break;
      const remaining = deadline - Date.now();
      if (remaining <= 0 || Atomics.wait(this.signal, WAKE_INDEX, current, remaining) === 'timed-out') {
        this.dead = `resolver did not answer within ${timeoutMs}ms (file: ${file})`;
        return {engineError: this.dead};
      }
    }

    // Requests are strictly sequential, so the next message is ours; the loop guards a stale leftover anyway.
    for (;;) {
      const received = receiveMessageOnPort(port) as {message: LintWorkerResponse} | undefined;
      if (!received) {
        this.dead = `resolver signalled seq ${seq} but no response message arrived`;
        return {engineError: this.dead};
      }
      if (received.message.seq !== seq) continue;
      if (received.message.error) {
        const engineError = `resolver failed: ${received.message.error}`;
        // Connection-level failures stick so later files answer instantly; per-file op errors don't.
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
    // The worker must never keep the host alive; on host exit its resolver child reads EOF and exits too.
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

// resolveWorkerURL finds the worker ENTRY FILE: a worker thread loads it through plain Node, never vite's
// transform, so running from src falls back to the built dist twin (the repo's stale-build check keeps it fresh).
function resolveWorkerURL(): URL {
  const sibling = new URL('./lint-worker.js', import.meta.url);
  if (existsSync(fileURLToPath(sibling))) return sibling;
  const dist = new URL('../../dist/lint/lint-worker.js', import.meta.url);
  if (existsSync(fileURLToPath(dist))) return dist;
  throw new Error('[runtypes] lint worker not found — build @mionjs/devtools first (pnpm --filter @mionjs/devtools run build)');
}

// sharedSession returns the module-level session every rule shares.
let shared: LintSession | null = null;

export function sharedSession(): LintSession {
  if (!shared) shared = new LintSession();
  return shared;
}

// prewarmSession starts the shared worker at plugin load so the launcher forks while the host is still small;
// the plugin entry top-level-awaits it. MION_LINT_PRESPAWN=0 starts the session on the first linted file instead.
export function prewarmSession(): Promise<void> {
  if (readEnvCompat('MION_LINT_PRESPAWN') === '0') return Promise.resolve();
  return sharedSession().start();
}

// resetSharedSession disposes the shared session (tests only).
export function resetSharedSession(): void {
  shared?.dispose();
  shared = null;
}
