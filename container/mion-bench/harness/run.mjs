/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Runs ONE app through ONE suite: spawn the server, prove it answers correctly,
// warm it up, then measure it under load while sampling its memory and CPU.
//
// Always invoked inside the mion-bench container by
// scripts/website/bench-data/mion-bench.mjs, one --rm container per app, so a leaked
// server process or a wedged port can never reach the next lane.
//
// Usage: node harness/run.mjs --app <name> --suite <key> [--size <key>]

import {execFileSync, spawn, spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {createConnection} from 'node:net';
import {availableParallelism, tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import pidusage from 'pidusage';
import {findApp} from '../shared/apps.mjs';
import {SUITES, SWEEP_SUITE} from '../shared/suites.mjs';

const HARNESS_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HARNESS_DIR, '..');
const PORT = Number(process.env.MION_BENCH_PORT || 3000);
const HOST = '127.0.0.1';
const RESULTS_DIR = process.env.MION_BENCH_RESULTS_DIR || join(ROOT, 'results');
const WRK_SCRIPT = join(HARNESS_DIR, 'wrk.lua');
const cpuCount = availableParallelism();

// Load settings. The defaults are the ones the docs pages quote; every one is a knob
// so a dev loop can run seconds instead of minutes (--quick sets them low).
const CONNECTIONS = Number(process.env.MION_BENCH_CONNECTIONS || 100);
const PIPELINING = Number(process.env.MION_BENCH_PIPELINING || 1);
const DURATION = Number(process.env.MION_BENCH_DURATION || 20);
const WARMUP = Number(process.env.MION_BENCH_WARMUP || 5);
// How long wrk waits for a response before it gives up on the socket and counts the
// request as a timeout. Its own default is TWO seconds, which the payload sweep is
// nowhere near: at 4 MB the p99 sits around 8-10s, so the LOAD GENERATOR would be
// cutting requests the server went on to answer correctly (every failure a timeout,
// with zero non-2xx), and the gate below would then fail a lane with nothing wrong
// with it. The ceiling is uniform across suites on purpose: a lane that answers
// quickly is unaffected, so this only stops the clock from manufacturing errors.
const TIMEOUT = Number(process.env.MION_BENCH_TIMEOUT || 60);
// wrk threads. HALF the cores, not all of them: the server under test is on the same
// box and needs cores of its own, which is the whole reason autocannon (one node
// process, competing for the same CPU) could not measure the bun lanes.
const THREADS = Number(process.env.MION_BENCH_THREADS || Math.max(1, Math.min(8, Math.floor(cpuCount / 2))));
// The spread two runs of the same lane are expected to stay inside, as a percentage.
// Recorded on every result so the docs pages can print it, and enforced by
// `pnpm miondevx bench servers repeat <app>`.
const TOLERANCE = Number(process.env.MION_BENCH_TOLERANCE || 10);
// Ceiling on the request-body bytes in flight at once (connections x payload). 100
// connections is the right load until the body is big enough that the extra ones only
// queue: at 4 MB that is ~400 MB in flight, which saturated the host and showed up as
// a handful of `write EPIPE` sockets and a p99 of 9-12s, while req/s was the same as
// at a quarter of the concurrency (48-50 vs 50-56). Capping the bytes keeps every
// sweep size measuring body handling instead of queue depth; sizes under the cap keep
// the full CONNECTIONS, so only the 4 MB lane moves.
const INFLIGHT_BUDGET = Number(process.env.MION_BENCH_INFLIGHT_BUDGET || 100 * 1024 * 1024);

/** Connections for one lane: the full count, reduced only when the bodies would exceed the budget. */
function connectionsFor(size) {
  if (!size) return CONNECTIONS;
  return Math.max(1, Math.min(CONNECTIONS, Math.floor(INFLIGHT_BUDGET / size.bytes)));
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, '')] = argv[i + 1];
  return args;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Resolve once the server accepts a TCP connection, or throw after `timeoutMs`. */
async function waitForPort(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const open = await new Promise((resolve) => {
      const socket = createConnection({port: PORT, host: HOST});
      socket.once('connect', () => (socket.destroy(), resolve(true)));
      socket.once('error', () => (socket.destroy(), resolve(false)));
    });
    if (open) return;
    await sleep(100);
  }
  throw new Error(`server never listened on ${HOST}:${PORT} within ${timeoutMs}ms`);
}

/**
 * One real request, checked before any measurement starts.
 *
 * Without this a lane that 400s or 404s every request still produces a beautiful
 * number - the fastest possible server is one that rejects the body without reading
 * it - and the docs table would publish it as a win. Correctness first, then speed.
 */
async function verify(app, suite, body) {
  const res = await fetch(`http://${HOST}:${PORT}${suite.path}`, {
    method: suite.method,
    headers: {'content-type': 'application/json', accept: '*/*'},
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${app.name} answered ${suite.path} with HTTP ${res.status}: ${text.slice(0, 300)}`);

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${app.name} answered ${suite.path} with a non-JSON body: ${text.slice(0, 200)}`);
  }

  // mion answers in its RPC envelope, keyed by route id; everyone else answers bare.
  const routeId = suite.path.slice(1);
  const payload = app.family === 'mion' ? parsed[routeId] : parsed;
  if (payload === undefined) throw new Error(`${app.name}: no '${routeId}' key in the response envelope: ${text.slice(0, 200)}`);

  if (suite.path === '/hello') {
    if (payload?.hello !== 'world') throw new Error(`${app.name}: expected {hello:'world'}, got ${JSON.stringify(payload).slice(0, 200)}`);
    return;
  }
  // The echo routes must return the user they were sent, which only a lane that
  // really parsed the body can do.
  const parsedBody = JSON.parse(body);
  const sent = app.family === 'mion' ? parsedBody[0] : parsedBody;
  if (payload?.id !== sent.id) throw new Error(`${app.name}: response id ${payload?.id} does not match the request id ${sent.id} - the body was not round-tripped`);
}

/**
 * The other half of the correctness gate: an INVALID payload must be rejected.
 *
 * A lane that quietly skipped validation would round-trip the valid sample happily
 * and post the fastest number in the table, because it is doing less work than every
 * other lane. That is the one failure this benchmark must never publish, and it is
 * invisible to the positive check - so each app is asked to reject a wrongly-typed
 * field before it is measured. Every framework here answers non-2xx (mion 422 with
 * typeErrors, the zod/JSON-Schema lanes 400).
 */
async function verifyRejects(app, suite, body) {
  if (suite.path === '/hello') return; // nothing to validate
  const parsedBody = JSON.parse(body);
  const invalid = app.family === 'mion' ? [{...parsedBody[0], id: 'not-a-number'}] : {...parsedBody, id: 'not-a-number'};
  const res = await fetch(`http://${HOST}:${PORT}${suite.path}`, {
    method: suite.method,
    headers: {'content-type': 'application/json', accept: '*/*'},
    body: JSON.stringify(invalid),
  });
  const text = await res.text();
  if (res.ok) {
    throw new Error(`${app.name}: accepted an invalid payload (id: 'not-a-number') with HTTP ${res.status} - this lane is NOT validating, so its numbers are not comparable: ${text.slice(0, 200)}`);
  }
}

/**
 * The version of the framework this lane measured, read from the tree it actually
 * ran against - the app's own node_modules, or for the mion lanes the workspace
 * package mounted into it. Reading the _deps manifest instead would publish the
 * RANGE we asked for rather than the version that produced the number.
 */
function resolveVersion(app, appDir) {
  if (app.versionOf === 'node') return process.versions.node;
  try {
    return JSON.parse(readFileSync(join(appDir, 'node_modules', app.versionOf, 'package.json'), 'utf8')).version;
  } catch {
    return null;
  }
}

/**
 * The version of the runtime that ran the SERVER. The harness itself is always node,
 * so process.versions.bun is never set here - ask the binary that will run the lane.
 */
function runtimeVersion(app) {
  if (app.runtime !== 'bun') return process.versions.node;
  try {
    return execFileSync('bun', ['--version'], {encoding: 'utf8'}).trim();
  } catch {
    return null;
  }
}

/** Sample RSS + CPU of the server process every second while the load runs. */
function startSampling(pid) {
  const memSeries = [];
  const cpuSeries = [];
  const timer = setInterval(async () => {
    try {
      const stat = await pidusage(pid);
      memSeries.push(Math.round((stat.memory / 1024 / 1024) * 100) / 100);
      cpuSeries.push(Math.round(stat.cpu * 100) / 100);
    } catch {
      // The process can exit between ticks; a missing sample is not a failure.
    }
  }, 1000);
  return {
    stop() {
      clearInterval(timer);
      return {
        memSeries,
        cpuSeries,
        maxMem: memSeries.length ? Math.max(...memSeries) : 0,
        maxCpu: cpuSeries.length ? Math.max(...cpuSeries) : 0,
      };
    },
  };
}

/**
 * Fail before a server is even spawned when the load generator is missing.
 *
 * A generator that is not on PATH is not a lane failure, and reporting it as one sends
 * the next reader looking at the framework instead of at the image.
 */
function requireWrk() {
  // `wrk --version` prints its banner and exits non-zero, so presence is what is checked.
  const probe = spawnSync('wrk', ['--version'], {encoding: 'utf8'});
  if (probe.error) {
    throw new Error(
      "wrk is not on PATH inside the container. The mion-bench image installs it, so this image is stale: rebuild it with 'pnpm miondevx container build-image mion-bench'"
    );
  }
}

/**
 * Split a body around its numeric id, so wrk can stamp a fresh one per request.
 *
 * Every payload in shared/payloads.mjs puts `id` first and varies nothing else, so the
 * whole per-request difference is that one number. Handing wrk the two halves keeps
 * shared/payloads.mjs the only place a payload is written; pasting the JSON into the Lua
 * script (which is what the upstream benchmarks repo did) leaves a second copy to drift
 * and cannot express the payload-size sweep at all.
 */
function bodyTemplate(body) {
  const match = /"id":(\d+)/.exec(body);
  if (!match) throw new Error(`the payload has no numeric "id" to vary per request: ${body.slice(0, 120)}`);
  const idAt = match.index + '"id":'.length;
  return {prefix: body.slice(0, idAt), suffix: body.slice(idAt + match[1].length)};
}

/**
 * One window of load, warm-up or measured, generated by wrk.
 *
 * Every request carries a DIFFERENT id (see bodyTemplate): a framework that memoized on
 * the body would otherwise be measured serving its own cache. `nextBody` returns
 * undefined for the bodyless hello-world suite, which needs no template at all.
 *
 * harness/wrk.lua writes its result to a FILE rather than printing it. wrk's own summary
 * shares stdout, and a parse that has to find its result in that stream is a parse that
 * can quietly find the wrong thing.
 */
async function load({duration, nextBody, suite, connections}) {
  const jobDir = mkdtempSync(join(tmpdir(), 'mion-wrk-'));
  // wrk splits the connections across its threads, so a lane whose payload capped the
  // connection count must not end up with more threads than it has sockets.
  const threads = Math.max(1, Math.min(THREADS, connections));
  try {
    const body = nextBody();
    if (body !== undefined) {
      const {prefix, suffix} = bodyTemplate(body);
      writeFileSync(join(jobDir, 'body.prefix'), prefix);
      writeFileSync(join(jobDir, 'body.suffix'), suffix);
    }
    const reportFile = join(jobDir, 'report.json');
    const args = [
      '-t', String(threads),
      '-c', String(connections),
      '-d', `${duration}s`,
      '--timeout', `${TIMEOUT}s`,
      '--latency',
      '-s', WRK_SCRIPT,
      `http://${HOST}:${PORT}${suite.path}`,
      // Trailing non-option arguments are handed to the script's own init(args).
      suite.method,
      String(PIPELINING),
    ];
    const env = {...process.env, MION_BENCH_WRK_REPORT: reportFile};
    if (body !== undefined) env.MION_BENCH_WRK_JOB = jobDir;

    const {code, stderr} = await new Promise((resolve, reject) => {
      // spawn, never spawnSync: the memory and CPU sampler is a timer, and a blocked
      // event loop would collect nothing for the whole measured window.
      const child = spawn('wrk', args, {stdio: ['ignore', 'pipe', 'pipe'], env});
      let collected = '';
      child.stdout.resume(); // drained on purpose: the numbers come from the report file
      child.stderr.on('data', (chunk) => (collected += chunk));
      child.once('error', reject);
      child.once('close', (exit) => resolve({code: exit, stderr: collected}));
    });
    const detail = stderr.trim() ? ` - ${stderr.trim()}` : '';
    if (code !== 0) throw new Error(`wrk exited with code ${code}${detail}`);

    let raw;
    try {
      raw = JSON.parse(readFileSync(reportFile, 'utf8'));
    } catch (err) {
      throw new Error(`wrk finished but wrote no result (${err.message})${detail}`);
    }
    return {
      requests: {mean: raw.requestsPerSec, stddev: raw.requestsStddev},
      latency: {mean: raw.latencyMeanMs, p99: raw.latencyP99Ms},
      throughput: {mean: raw.bytes / raw.durationSec},
      non2xx: raw.non2xx,
      timeouts: raw.timeouts,
      // Timeouts counted in with the rest, the convention the gate below already reads.
      errors: raw.connect + raw.read + raw.write + raw.timeouts,
      // The gate deletes a failed lane's record, so the cause has to survive in the
      // thrown message. wrk reports socket failures by kind rather than by message.
      socketErrors: {connect: raw.connect, read: raw.read, write: raw.write},
      threads,
    };
  } finally {
    rmSync(jobDir, {recursive: true, force: true});
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  requireWrk();
  const app = findApp(args.app);
  if (!app) throw new Error(`unknown app '${args.app}'`);

  const isSweep = Boolean(args.size);
  const suite = isSweep ? SWEEP_SUITE : SUITES[args.suite];
  if (!suite) throw new Error(`unknown suite '${args.suite}'`);
  const size = isSweep ? suite.sizes.find((s) => s.key === args.size) : undefined;
  if (isSweep && !size) throw new Error(`unknown size '${args.size}'`);

  const appDir = join(ROOT, 'apps', app.dir);
  const label = isSweep ? `${app.name} · ${size.label}` : `${app.name} · ${args.suite}`;
  console.log(`-------- ${label} --------`);

  const server = spawn(app.runtime, [app.entry], {
    cwd: appDir,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {...process.env, MION_BENCH_PORT: String(PORT), NODE_ENV: 'production'},
  });
  let exited = null;
  server.on('exit', (code, signal) => (exited = {code, signal}));

  try {
    await Promise.race([
      waitForPort(),
      (async () => {
        // Surface a server that died on startup as itself, not as a port timeout.
        while (!exited) await sleep(100);
        throw new Error(`${app.name} exited during startup (code ${exited.code}, signal ${exited.signal})`);
      })(),
    ]);

    const nextBody = () => (isSweep ? suite.body(app, size) : suite.body(app));
    const sampleBody = nextBody();
    await verify(app, suite, sampleBody);
    await verifyRejects(app, suite, sampleBody);
    console.log(`verified: ${app.name} answers ${suite.path} correctly and rejects invalid input`);

    // Warm up so JIT compilation and the first-request work never land in the
    // measured window, then measure.
    const connections = connectionsFor(size);
    if (WARMUP > 0) await load({duration: WARMUP, nextBody, suite, connections});
    const sampler = startSampling(server.pid);
    // Only the MEASURED window is judged by the gate; warm-up errors are discarded.
    const result = await load({duration: DURATION, nextBody, suite, connections});
    const usage = sampler.stop();

    const outDir = isSweep ? join(RESULTS_DIR, 'payload-sizes', size.key) : join(RESULTS_DIR, args.suite);
    mkdirSync(outDir, {recursive: true});
    const record = {
      app: app.name,
      label: app.label,
      version: resolveVersion(app, appDir),
      runtimeVersion: runtimeVersion(app),
      family: app.family,
      runtime: app.runtime,
      router: app.router,
      validation: app.validation,
      description: app.description,
      suite: isSweep ? 'payload-sizes' : args.suite,
      size: size ? {key: size.key, label: size.label, bytes: size.bytes, actualBytes: Buffer.byteLength(sampleBody ?? '')} : undefined,
      requests: {mean: result.requests.mean, stddev: result.requests.stddev},
      latency: {mean: result.latency.mean, p99: result.latency.p99},
      throughput: {mean: result.throughput.mean},
      errors: result.errors,
      non2xx: result.non2xx,
      timeouts: result.timeouts,
      ...usage,
      loader: 'wrk',
      connections,
      threads: result.threads,
      pipelining: PIPELINING,
      duration: DURATION,
      timeout: TIMEOUT,
      // What two runs of this lane are expected to agree within. Published beside the
      // method line, and enforced by `pnpm miondevx bench servers repeat <app>`.
      tolerance: TOLERANCE,
      // The environment the number was taken in, so the docs page can state it rather
      // than a human transcribing it into the markdown (which is how the previous
      // numbers went stale).
      env: {
        os: `${process.platform} ${process.arch}`,
        cores: cpuCount,
        cpu: process.env.MION_BENCH_HOST_CPU || null,
        node: process.versions.node,
        generatedAt: new Date().toISOString(),
      },
    };
    console.log(`${app.name}: ${Math.round(result.requests.mean)} req/s, ${result.latency.mean}ms, maxMem ${usage.maxMem}MB`);

    // A run whose requests did not all succeed is not a measurement of the fast path.
    // Gate BEFORE the write, and drop any record an earlier run left: the file on disk
    // is exactly what gen-servers-docs publishes, so a lane that fails here must leave
    // nothing behind. Writing first meant a failed lane's degraded numbers reached the
    // site anyway, with only the driver's exit code standing between them and a deploy.
    const recordFile = join(outDir, `${app.name}.json`);
    if (result.non2xx > 0 || result.errors > 0) {
      rmSync(recordFile, {force: true});
      // Break the errors down: a timeout means the load generator gave up waiting
      // (raise MION_BENCH_TIMEOUT), anything else is the connection actually failing.
      // Removing the record above takes the raw counters with it, so they have to be
      // in the message or the lane is undiagnosable from a CI log.
      const other = result.errors - result.timeouts;
      const causes = Object.entries(result.socketErrors)
        .filter(([, count]) => count > 0)
        .map(([kind, count]) => `${count}x socket ${kind}`)
        .join('; ');
      throw new Error(
        `${app.name}: ${result.non2xx} non-2xx, ${result.timeouts} timed out and ${other} otherwise errored ` +
          `during the measured run (timeout ${TIMEOUT}s, ${connections} connections over ${result.threads} wrk threads, ` +
          `mean ${result.latency.mean}ms / p99 ${result.latency.p99}ms)` +
          (causes ? ` - ${causes}` : '')
      );
    }
    writeFileSync(recordFile, `${JSON.stringify(record, null, 2)}\n`);
  } finally {
    if (!exited) server.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error(`==> ${err.message}`);
  process.exit(1);
});
