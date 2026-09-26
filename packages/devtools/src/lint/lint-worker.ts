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
import {readEnvCompat} from '../core/envCompat.ts';
import {Family, Level, Severity, type Diagnostic} from '../core/protocol.ts';
import {buildResolverArgs, ResolverClient, ResolverStreamClient, type ResolverConnection} from '../core/resolver-client.ts';
import {WAKE_INDEX, type LintWorkerData, type LintWorkerRequest, type LintWorkerResponse} from './session-protocol.ts';

const data = workerData as LintWorkerData;
const requests = data.port;
const signal = data.signal;

// Pre-spawn the launcher NOW, while forking is still possible; the session awaits the shimReady signal below
// before the plugin finishes loading. On failure (or opt-out) the direct spawn path serves small hosts.
let shim: ChildProcess | null = null;
if (readEnvCompat('MION_LINT_PRESPAWN') !== '0') {
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
    throw new Error(`settings.runtypes.binary=${binary} does not exist (resolved to ${resolved})`);
  }
  return resolved;
}

// ensureConnection opens the resolver on the first request, preferring the pre-spawned shim over a direct spawn.
// The connection is long-lived, so the first request's tsconfig and binary fix the options for every later file.
async function ensureConnection(tsconfig: string, binary: string): Promise<ResolverConnection> {
  if (connection) return connection;
  // A configured binary wins; otherwise @mionjs/bin-compiler resolves the host-platform one (honouring MION_BIN).
  // The resolver is rooted at process.cwd(), the directory the linter itself runs in. Only an explicit tsconfig
  // is forwarded; otherwise the Go side discovers it as tsc does and adopts its FULL options, so lint
  // type-checks like the build. Single-threaded: the session lints one file at a time, and a light child keeps
  // editor/CI hosts under process and memory limits.
  const binaryPath = binary ? resolveConfiguredBinary(binary) : getExePath();
  // bundleApi off: lint cannot know each client's build mode, so the bundled-API checks stay with the build
  const options = {serverMode: true, singleThreaded: true, bundleApi: 'off'} as const;
  const args = buildResolverArgs(process.cwd(), tsconfig, options);
  if (shim?.stdin && shim.stdout && shim.exitCode === null) {
    const launcher = shim;
    launcher.stdin!.write(JSON.stringify({exec: binaryPath, args}) + '\n');
    const stream = new ResolverStreamClient(launcher.stdin!, launcher.stdout!, () => launcher.kill());
    launcher.on('exit', () => stream.markClosed('resolver exited'));
    connection = stream;
    return connection;
  }
  connection = new ResolverClient(binaryPath, process.cwd(), tsconfig, options);
  return connection;
}

// connectionLostPattern matches the transport's own connection-death strings (a dead child or socket), as
// opposed to a per-file op error the resolver answered with.
const connectionLostPattern = /resolver exited|spawn failed|socket closed|socket error|resolver is closed/;

async function lintOne(request: LintWorkerRequest): Promise<LintWorkerResponse> {
  // One retry on a fresh connection, so a transient failure does not poison the whole run. No shim remains for
  // the retry: the direct path is the fallback and may itself fail under host limits, which then reports.
  for (let attempt = 0; ; attempt++) {
    let stage: 'connect' | 'scan' = 'connect';
    try {
      const resolver = await ensureConnection(request.tsconfig ?? '', request.binary ?? '');
      stage = 'scan';
      const rel = path.relative(process.cwd(), request.file) || request.file;
      await resolver.setSources({[rel]: request.text});
      const result = await resolver.scanFiles([rel], {checkEnrich: true, checkRouterRules: true, includeRtDiagnostics: true});
      // Pattern verdicts (FMT001/FMT002/FMT004) arrive as ordinary diagnostics: the resolver runs the JS
      // engine itself, so this worker re-checks nothing.
      const diagnostics = (result.diagnostics ?? []) as Diagnostic[];
      return {seq: request.seq, diagnostics};
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // CFG001 is the daemon refusing to load the project tsconfig: deterministic, so retrying is pointless, and
      // the config problem is the actionable error, so it reports at the file top instead of "engine
      // unavailable". The connection stays up; the daemon re-parses on the next setSources, so a fix heals the
      // next lint.
      if (message.includes('CFG001')) {
        return {
          seq: request.seq,
          diagnostics: [
            {
              code: 'CFG001',
              family: Family.Marker,
              severity: Severity.Error,
              level: Level.Error,
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
