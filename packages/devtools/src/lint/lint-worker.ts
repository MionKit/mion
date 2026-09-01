// Worker-thread half of the lint session's sync bridge (see session.ts).
//
// Lint rules are synchronous, but the resolver clients are Promise-based —
// so the async work lives here, in a worker thread the rule thread blocks on
// with Atomics.wait. The worker owns ONE long-lived resolver connection for
// the whole lint run, so the tsgo Program machinery is amortised across
// files exactly like the vitest helpers' server-mode setup.
//
// Child-process strategy: the worker starts at PLUGIN LOAD and immediately
// pre-spawns the generic launcher (spawn-shim.ts) while the host process is
// still small — lint hosts that embed the Rust linter in-process (oxlint)
// balloon to tens of GB of reserved address space once linting starts, after
// which fork() fails with ENOMEM on Linux. On the first request the worker
// hands the shim the real binary + argv and speaks the resolver protocol over
// the shim's pipes.
//
// Per request the worker mirrors the unplugin's HMR pivot: push the file's
// buffer text (`setSources` — an inferred Program rooted at the file, its
// imports read through the overlay FS from disk), then `scanFiles` with
// checkEnrich + includeRtDiagnostics so ONE pass returns everything a build
// would surface.

import {spawn, type ChildProcess} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parentPort, workerData} from 'node:worker_threads';
import {getExePath} from '@ts-runtypes/bin';
import {readEnvCompat} from '../core/envCompat.ts';
import {Family, Severity, type Diagnostic} from '../core/protocol.ts';
import {buildResolverArgs, ResolverClient, ResolverStreamClient, type ResolverConnection} from '../core/resolver-client.ts';
import {WAKE_INDEX, type LintWorkerData, type LintWorkerRequest, type LintWorkerResponse} from './session-protocol.ts';

const data = workerData as LintWorkerData;
const requests = data.port;
const signal = data.signal;

// Pre-spawn the launcher NOW — this module only loads at plugin-load time,
// when forking is still possible. If it fails (or is opted out), the direct
// spawn path below still serves small hosts like plain ESLint. The session
// AWAITS the shimReady signal below before letting the plugin finish loading,
// so the fork deterministically happens before the host balloons.
let shim: ChildProcess | null = null;
if (readEnvCompat('MION_LINT_PRESPAWN') !== '0') {
  try {
    shim = spawn(process.execPath, [fileURLToPath(new URL('./spawn-shim.js', import.meta.url))], {
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    shim.on('error', () => {
      shim = null;
    });
    // Unref the child AND its pipes (net.Socket instances at runtime) so an
    // idle shim never keeps the worker's event loop alive.
    shim.unref();
    (shim.stdin as unknown as {unref?: () => void}).unref?.();
    (shim.stdout as unknown as {unref?: () => void}).unref?.();
  } catch {
    shim = null;
  }
}
parentPort?.postMessage({shimReady: true});

let connection: ResolverConnection | null = null;

// resolveConfiguredBinary checks a `settings.runtypes.binary` path up front so a
// typo reports as a config mistake naming the setting, not as an opaque spawn
// failure. Same rule the launcher applies to MION_BIN: never fall back to a
// different binary, whose version would key caches differently.
function resolveConfiguredBinary(binary: string): string {
  const resolved = path.resolve(binary);
  if (!existsSync(resolved)) {
    throw new Error(`settings.runtypes.binary=${binary} does not exist (resolved to ${resolved})`);
  }
  return resolved;
}

// ensureConnection lazily opens the resolver on the first request, preferring
// the pre-spawned shim, then a direct spawn. The tsconfig and the binary are read
// here, once: the connection is long-lived for the whole run, so the first
// request's values fix the resolution options for every later file.
async function ensureConnection(tsconfig: string, binary: string): Promise<ResolverConnection> {
  if (connection) return connection;
  // A configured `settings.runtypes.binary` wins; otherwise resolve the
  // host-platform binary from the ts-runtypes-bin launcher (which honours MION_BIN
  // and throws with a clear message when no platform package is installed),
  // rooted at process.cwd() — the directory the linter itself runs in, like any
  // other linter. Only an explicitly configured tsconfig is forwarded; otherwise
  // the Go side discovers it exactly as tsc does (upward from cwd) and adopts its
  // FULL options, so lint type-checks like the build.
  // Single-threaded: the session lints one file at a time, and a light child keeps
  // editor/CI hosts well under process/memory limits.
  const binaryPath = binary ? resolveConfiguredBinary(binary) : getExePath();
  const args = buildResolverArgs(process.cwd(), tsconfig, {serverMode: true, singleThreaded: true});
  if (shim?.stdin && shim.stdout && shim.exitCode === null) {
    const launcher = shim;
    launcher.stdin!.write(JSON.stringify({exec: binaryPath, args}) + '\n');
    const stream = new ResolverStreamClient(launcher.stdin!, launcher.stdout!, () => launcher.kill());
    launcher.on('exit', () => stream.markClosed('resolver exited'));
    connection = stream;
    return connection;
  }
  connection = new ResolverClient(binaryPath, process.cwd(), tsconfig, {serverMode: true, singleThreaded: true});
  return connection;
}

// connectionLostPattern matches the transport's connection-death reasons
// (markClosed strings this package owns) — a dead child/socket, as opposed to
// a per-file op error the resolver answered with.
const connectionLostPattern = /resolver exited|spawn failed|socket closed|socket error|resolver is closed/;

async function lintOne(request: LintWorkerRequest): Promise<LintWorkerResponse> {
  // One retry on a fresh connection: a transient failure shouldn't poison
  // the whole run. (No shim remains for the retry — the direct path is the
  // fallback and may itself fail under host limits; the error then reports.)
  for (let attempt = 0; ; attempt++) {
    let stage: 'connect' | 'scan' = 'connect';
    try {
      const resolver = await ensureConnection(request.tsconfig ?? '', request.binary ?? '');
      stage = 'scan';
      const rel = path.relative(process.cwd(), request.file) || request.file;
      await resolver.setSources({[rel]: request.text});
      const result = await resolver.scanFiles([rel], {checkEnrich: true, includeRtDiagnostics: true});
      // Pattern verdicts (FMT001/FMT002/FMT004) arrive as ordinary
      // diagnostics — the resolver runs the real JS engine itself now, so
      // this worker no longer re-checks anything.
      const diagnostics = (result.diagnostics ?? []) as Diagnostic[];
      return {seq: request.seq, diagnostics};
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // A CFG001-tagged op error is the daemon refusing to load the project
      // tsconfig (strict like tsc) — deterministic, so retrying is pointless.
      // Surface it as a real Error-severity lint diagnostic at the file top
      // (the config problem is the actionable finding) instead of reporting
      // the engine unavailable. The connection stays up: the daemon re-parses
      // on the next setSources, so a fixed config heals the very next lint.
      if (message.includes('CFG001')) {
        return {
          seq: request.seq,
          diagnostics: [
            {
              code: 'CFG001',
              family: Family.Marker,
              severity: Severity.Error,
              args: [message.replace(/^.*CFG001\s*/, '')],
              site: {filePath: request.file, startLine: 1, startCol: 1},
            },
          ],
        };
      }
      connection?.close();
      connection = null;
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        continue;
      }
      return {seq: request.seq, error: message, fatal: stage === 'connect' || connectionLostPattern.test(message)};
    }
  }
}

requests.on('message', (request: LintWorkerRequest) => {
  void lintOne(request).then((response) => {
    requests.postMessage(response);
    // Wake the rule thread AFTER the response is queued on the port.
    Atomics.store(signal, WAKE_INDEX, response.seq);
    Atomics.notify(signal, WAKE_INDEX);
  });
});

// Session teardown: close the child/socket so the Go process exits promptly.
parentPort?.on('message', (message: {close?: boolean}) => {
  if (message?.close) {
    connection?.close();
    connection = null;
    shim?.kill();
    shim = null;
    process.exit(0);
  }
});
