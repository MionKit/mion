// Worker-thread half of the lint session's sync bridge (see session.ts): the Promise-based resolver work lives
// here, behind the rule thread's Atomics.wait. The worker owns ONE long-lived resolver connection for the whole
// run, so the tsgo Program machinery is amortised across files, and at PLUGIN LOAD it pre-spawns the generic
// launcher (spawn-shim.ts) while the host process is still small enough to fork, handing it the real binary and
// argv on the first request. Per request it mirrors the unplugin's HMR pivot: push the file's buffer text
// (`setSources`, an inferred Program rooted at the file, its imports read from disk through the overlay FS),
// then `scanFiles` with checkEnrich + checkRouterRules + includeRtDiagnostics, so ONE pass returns what a build
// reports plus the two checks only lint runs.

import {spawn, type ChildProcess} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parentPort, workerData} from 'node:worker_threads';
import {getExePath} from '@mionjs/bin-compiler';
import {Family, Level, Severity, type Diagnostic} from '../core/protocol.ts';
import {buildResolverArgs, ResolverClient, ResolverStreamClient, type ResolverConnection} from '../core/resolver-client.ts';
import {
  LINT_RESOLVER_OPTIONS,
  WAKE_INDEX,
  type LintWorkerData,
  type LintWorkerRequest,
  type LintWorkerResponse,
} from './session-protocol.ts';

const data = workerData as LintWorkerData;
const requests = data.port;
const signal = data.signal;

// Pre-spawn the launcher NOW, while forking is still possible; the session awaits the shimReady signal below
// before the plugin finishes loading. On failure (or opt-out) the direct spawn path serves small hosts.
let shim: ChildProcess | null = null;
if (process.env.MION_LINT_PRESPAWN !== '0') {
  try {
    shim = spawn(process.execPath, [fileURLToPath(new URL('./spawn-shim.js', import.meta.url))], {
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    shim.on('error', () => {
      shim = null;
    });
    // Unref the child AND its pipes (net.Sockets at runtime) or an idle shim keeps the worker's loop alive.
    shim.unref();
    (shim.stdin as unknown as {unref?: () => void}).unref?.();
    (shim.stdout as unknown as {unref?: () => void}).unref?.();
  } catch {
    shim = null;
  }
}
parentPort?.postMessage({shimReady: true});

let connection: ResolverConnection | null = null;

// resolveConfiguredBinary checks the path up front so a typo reports as a config mistake naming the setting, not
// an opaque spawn failure. Never falls back to another binary, whose version would key caches differently.
function resolveConfiguredBinary(binary: string): string {
  const resolved = path.resolve(binary);
  if (!existsSync(resolved)) {
    throw new Error(`settings.mion.binary=${binary} does not exist (resolved to ${resolved})`);
  }
  return resolved;
}

// The connection is long-lived, so the first request's tsconfig and binary fix the options for every later file.
async function ensureConnection(tsconfig: string, binary: string): Promise<ResolverConnection> {
  if (connection) return connection;
  // getExePath honours MION_BIN.
  // An unset tsconfig is discovered as tsc does, with its FULL options, so lint type-checks like the build.
  // Single-threaded: one file at a time, and a light child keeps editor/CI hosts under process and memory limits.
  const binaryPath = binary ? resolveConfiguredBinary(binary) : getExePath();
  const args = buildResolverArgs(process.cwd(), tsconfig, LINT_RESOLVER_OPTIONS);
  if (shim?.stdin && shim.stdout && shim.exitCode === null) {
    const launcher = shim;
    launcher.stdin!.write(JSON.stringify({exec: binaryPath, args}) + '\n');
    const stream = new ResolverStreamClient(launcher.stdin!, launcher.stdout!, () => launcher.kill());
    launcher.on('exit', () => stream.markClosed('resolver exited'));
    connection = stream;
    return connection;
  }
  connection = new ResolverClient(binaryPath, process.cwd(), tsconfig, LINT_RESOLVER_OPTIONS);
  return connection;
}

// The transport's own connection-death strings, not a per-file op error the resolver answered with.
const connectionLostPattern = /resolver exited|spawn failed|resolver is closed/;

async function lintOne(request: LintWorkerRequest): Promise<LintWorkerResponse> {
  // Retry once to recover transient failures; the fallback can also fail.
  for (let attempt = 0; ; attempt++) {
    let stage: 'connect' | 'scan' = 'connect';
    try {
      const resolver = await ensureConnection(request.tsconfig ?? '', request.binary ?? '');
      stage = 'scan';
      const rel = path.relative(process.cwd(), request.file) || request.file;
      await resolver.setSources({[rel]: request.text});
      const result = await resolver.scanFiles([rel], {checkEnrich: true, checkRouterRules: true, includeRtDiagnostics: true});
      // The resolver runs the JS engine for format-* verdicts; the worker must not recheck them.
      const diagnostics = (result.diagnostics ?? []) as Diagnostic[];
      return {seq: request.seq, diagnostics, downgradeErrors: result.downgradeErrors};
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // The import gate can admit JavaScript excluded by allowJs.
      if (stage === 'scan' && message.includes('source file not in program:')) {
        return /\.(?:[cm]?js|jsx)$/i.test(request.file)
          ? {seq: request.seq, diagnostics: []}
          : {seq: request.seq, error: message};
      }
      // Config failures are deterministic; report them at the file top without retrying or closing the connection.
      // The daemon reparses on setSources, so a fixed config heals on the next lint.
      if (message.includes('config-tsconfig-not-loaded')) {
        return {
          seq: request.seq,
          diagnostics: [
            {
              code: 'config-tsconfig-not-loaded',
              family: Family.Marker,
              severity: Severity.Error,
              level: Level.Error,
              args: [message.replace(/^.*config-tsconfig-not-loaded\s*/, '')],
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

// Close the child so the Go process exits promptly.
parentPort?.on('message', (message: {close?: boolean}) => {
  if (message?.close) {
    connection?.close();
    connection = null;
    shim?.kill();
    shim = null;
    process.exit(0);
  }
});
