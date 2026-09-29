// `core test-skip`: run only the vitest files whose code changed since they last passed. A file's key hashes
// the code it loads AFTER the vite transform (the mion compiler's output, not the Go source), its external
// package paths (pnpm puts the version there) and a salt. A file reaching outside its import graph is never cached.
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, relative} from 'node:path';
import {parseArgs} from 'node:util';
import {REPO_ROOT} from '../lib/env.mjs';
import {die, note, reportCliError} from '../lib/proc.mjs';

// Importing one of these makes a result depend on something no key can see.
const UNCACHEABLE = /^(node:)?(child_process|fs|fs\/promises|net|http|https|http2|worker_threads|cluster|dgram)$/;
// Time-boxed fuzz runs cover what the clock allows, so a rerun is never the same run.
const TIME_BOXED = /\/test\/fuzz\/.*\.integration\.test\.ts$/;
const KEEP_PER_FILE = 3;
// Without mock.seed the compiler draws new samples every build, so they are stripped; a declared pool is in source.
// Stops at the FIRST `]`: a sample holding one cuts the strip short (a missed skip), never past the list.
const DRAWN_SAMPLES = /(mockSamples(?:\\?["'])?\s*:\s*\[)[^\]]*\]/g;
const GENERATED = /\/\.mion[^/]*\//;
export const stableCode = (path, code) => (GENERATED.test(path) ? code.replace(DRAWN_SAMPLES, '$1]') : code);
const DEFAULT_STORE = join(REPO_ROOT, 'node_modules/.cache/mion/vitest-passed.json');

const sha = (...parts) => {
  const hash = createHash('sha256');
  for (const part of parts) hash.update(part).update('\0');
  return hash.digest('hex');
};

// Same walk as vitest's own `--changed`.
export async function moduleGraph(project, file) {
  const env = project.vite.environments.ssr;
  const modules = new Map();
  const externals = new Set();
  const reasons = new Set();
  const visit = async (filepath) => {
    if (modules.has(filepath)) return;
    modules.set(filepath, '');
    const transformed = env.moduleGraph.getModuleById(filepath)?.transformResult || (await env.transformRequest(filepath));
    if (!transformed) return;
    modules.set(filepath, stableCode(filepath, transformed.code));
    for (const dep of [...(transformed.deps ?? []), ...(transformed.dynamicDeps ?? [])]) {
      if (UNCACHEABLE.test(dep)) reasons.add(`imports ${dep}`);
      const fsPath = dep.startsWith('/@fs/') ? dep.slice(4) : join(project.config.root, dep);
      if (fsPath.includes('node_modules') || !existsSync(fsPath)) externals.add(dep.startsWith('/@fs/') ? relative(REPO_ROOT, fsPath) : dep);
      else await visit(fsPath);
    }
  };
  await visit(file);
  return {modules, externals, reasons};
}

// Exported for the unit tests.
export function fileKey({modules, externals}, salt) {
  const parts = [salt];
  for (const path of [...modules.keys()].sort()) parts.push(relative(REPO_ROOT, path), modules.get(path));
  parts.push(...[...externals].sort());
  return sha(...parts);
}

// What changes a result but no import records: toolchain, configs, fuzz seeds.
function baseSalt(vitest) {
  const fuzzEnv = Object.keys(process.env)
    .filter((name) => name.startsWith('MION_FUZZ_'))
    .sort()
    .map((name) => `${name}=${process.env[name]}`);
  const read = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : '');
  return sha(process.version, vitest.version, read(join(REPO_ROOT, 'vitest.config.ts')), read(join(REPO_ROOT, 'version.json')), ...fuzzEnv);
}

// Setup files run around every test file, so their graphs join every key (the rpc-client test server, vercel's bundles).
async function projectSalt(project, base) {
  const setups = [project.config.config ?? '', ...(project.config.setupFiles ?? []), ...(project.config.globalSetup ?? [])].filter((path) => path && existsSync(path));
  const parts = [base, project.name];
  for (const setup of setups) {
    const graph = await moduleGraph(project, setup);
    parts.push(fileKey(graph, ''), ...graph.reasons);
  }
  return sha(...parts);
}

const specId = (project, moduleId) => `${project.name}::${relative(REPO_ROOT, moduleId)}`;

// A set `reason` means never cache that file.
async function specKeys(vitest, specs) {
  const base = baseSalt(vitest);
  const salts = new Map();
  const keys = {};
  for (const spec of specs) {
    if (!salts.has(spec.project)) salts.set(spec.project, await projectSalt(spec.project, base));
    const graph = await moduleGraph(spec.project, spec.moduleId);
    const reason = TIME_BOXED.test(spec.moduleId) ? 'time-boxed fuzz' : [...graph.reasons][0] ?? '';
    keys[specId(spec.project, spec.moduleId)] = {key: fileKey(graph, salts.get(spec.project)), reason};
  }
  return keys;
}

function readStore(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

// A few keys per file, so switching branches back and forth still hits.
export function recordPass(store, id, key) {
  store[id] = [key, ...(store[id] ?? []).filter((old) => old !== key)].slice(0, KEEP_PER_FILE);
}

export const isProven = (store, id, {key, reason}) => !reason && (store[id] ?? []).includes(key);

async function openVitest({filters = [], projects = [], excludes = [], reporters = []} = {}) {
  const {createVitest} = await import('vitest/node');
  const options = {watch: false, run: true, passWithNoTests: true, cliExclude: excludes};
  if (projects.length > 0) options.project = projects;
  if (reporters.length > 0) options.reporters = ['default', ...reporters];
  const vitest = await createVitest('test', options);
  const specs = await vitest.globTestSpecifications(filters);
  return {vitest, specs};
}

// A file with ANY skipped test is never recorded: a `.skipIf(!HAS_BIN)` looks the same as a real skip.
export function passRecorder() {
  const passed = new Set();
  const failed = new Set();
  const reporter = {
    onTestModuleEnd(testModule) {
      const id = specId(testModule.project, testModule.moduleId);
      const tests = [...testModule.children.allTests()];
      if (testModule.state() !== 'passed') failed.add(id);
      else if (tests.length > 0 && tests.every((test) => test.result().state === 'passed')) passed.add(id);
    },
  };
  return {reporter, passed, failed};
}

// `--keys <file>`: a lasting debug tool, to see why a file re-ran or never caches.
async function writeKeys(out, scope) {
  const started = performance.now();
  const {vitest, specs} = await openVitest(scope);
  const keys = await specKeys(vitest, specs);
  await vitest.close();
  mkdirSync(dirname(out), {recursive: true});
  writeFileSync(out, `${JSON.stringify(keys, null, 2)}\n`);
  const uncached = Object.values(keys).filter((entry) => entry.reason).length;
  note(`test-skip: ${specs.length} file(s) keyed in ${Math.round(performance.now() - started)} ms, ${uncached} never cached -> ${relative(REPO_ROOT, out)}`);
}

// The proven files that failed anyway: each one's key misses an input.
export const missedFiles = (provenIds, failed) => provenIds.filter((id) => failed.has(id));

// `audit` runs everything and fails when a file the list would skip fails.
async function runSkipping({store: storePath, audit, ...scope}) {
  const recorder = passRecorder();
  const {vitest, specs} = await openVitest({...scope, reporters: [recorder.reporter]});
  const keys = await specKeys(vitest, specs);
  const store = readStore(storePath);
  const proven = specs.filter((spec) => isProven(store, specId(spec.project, spec.moduleId), keys[specId(spec.project, spec.moduleId)]));
  const toRun = audit ? specs : specs.filter((spec) => !proven.includes(spec));
  note(`test-skip: ${specs.length} file(s), ${proven.length} already passed at these exact inputs, running ${toRun.length}`);
  if (toRun.length > 0) await vitest.runTestSpecifications(toRun, audit || proven.length === 0);
  const unhandled = vitest.state.getUnhandledErrors().length;
  await vitest.close();
  // An unhandled error belongs to no file, so nothing from that run is trusted.
  if (unhandled === 0) {
    for (const id of recorder.passed) if (keys[id] && !keys[id].reason) recordPass(store, id, keys[id].key);
    mkdirSync(dirname(storePath), {recursive: true});
    writeFileSync(storePath, `${JSON.stringify(store)}\n`);
  }
  const missed = audit ? missedFiles(proven.map((spec) => specId(spec.project, spec.moduleId)), recorder.failed) : [];
  if (missed.length > 0) die(`core test-skip: ${missed.length} file(s) the passed list would have skipped FAILED, so their key misses an input: ${missed.join(', ')}`);
  if (recorder.failed.size > 0 || unhandled > 0) die(`core test-skip: ${recorder.failed.size} file(s) failed, ${unhandled} unhandled error(s)`);
}

export function parseCli(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {keys: {type: 'string'}, store: {type: 'string'}, project: {type: 'string', multiple: true}, exclude: {type: 'string', multiple: true}, audit: {type: 'boolean'}},
    });
  } catch (err) {
    die(`core test-skip: ${err.message}`, 2);
  }
  const {values, positionals} = parsed;
  return {keys: values.keys, store: values.store ?? DEFAULT_STORE, audit: Boolean(values.audit), scope: {filters: positionals, projects: values.project ?? [], excludes: values.exclude ?? []}};
}

export async function main(argv = []) {
  const cli = parseCli(argv);
  if (cli.keys) return writeKeys(cli.keys, cli.scope);
  return runSkipping({...cli.scope, audit: cli.audit, store: cli.store});
}

if (import.meta.main) {
  try {
    await main(process.argv.slice(2));
  } catch (err) {
    reportCliError(err);
  }
}
