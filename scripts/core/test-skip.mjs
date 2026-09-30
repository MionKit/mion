// `core test-skip`: run only the vitest files whose code changed since they last passed. A file's key hashes
// the code it loads AFTER the vite transform (the mion compiler's output, not the Go source), its external
// packages by version, its declared inputs and a salt. A file reaching outside its import graph undeclared is never cached.
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {dirname, join, relative} from 'node:path';
import {parseArgs} from 'node:util';
import {REPO_ROOT} from '../lib/env.mjs';
import {goBinCacheKey} from './build.mjs';
import {die, note, reportCliError} from '../lib/proc.mjs';

// Importing one of these makes a result depend on something no key can see.
const UNCACHEABLE = /^(node:)?(child_process|fs|fs\/promises|net|http|https|http2|worker_threads|cluster|dgram)$/;
// Packages that read files on the caller's behalf (a TypeScript program, a bundler build, a linter run).
const READS_FILES = /^(typescript|vite|rollup|rolldown|esbuild|webpack|@rspack\/core|eslint|oxlint)@/;
const PACKAGE = /^(.*node_modules\/)((?:@[^/]+\/)?[^/]+)/;
// Time-boxed fuzz runs cover what the clock allows, so a rerun is never the same run.
const TIME_BOXED = /\/test\/fuzz\/.*\.integration\.test\.ts$/;
const KEEP_PER_FILE = 3;
// Without mock.seed the compiler draws new samples every build, so they are stripped; a declared pool is in source.
// Stops at the FIRST `]`: a sample holding one cuts the strip short (a missed skip), never past the list.
const DRAWN_SAMPLES = /(mockSamples(?:\\?["'])?\s*:\s*\[)[^\]]*\]/g;
const GENERATED = /\/\.mion[^/]*\//;
export const stableCode = (path, code) => (GENERATED.test(path) ? code.replace(DRAWN_SAMPLES, '$1]') : code);
const DEFAULT_STORE = join(REPO_ROOT, 'node_modules/.cache/mion/vitest-passed.json');
export const GO_BINS = 'mion-bin';
// Modules that reach outside the graph on purpose, and everything they reach; their builtin imports stop blocking a file.
export const DECLARED = {
  // Teardown only: it deletes the genDirs after the whole run.
  'scripts/lib/vitest-clean-gendir.ts': [],
};

const sha = (...parts) => {
  const hash = createHash('sha256');
  for (const part of parts) hash.update(part).update('\0');
  return hash.digest('hex');
};

// Same walk as vitest's own `--changed`.
export async function moduleGraph(project, file, declared = DECLARED) {
  const env = project.vite.environments.ssr;
  const modules = new Map();
  const externals = new Set();
  const reasons = new Set();
  const inputs = new Set();
  const visit = async (filepath) => {
    if (modules.has(filepath)) return;
    modules.set(filepath, '');
    const transformed = env.moduleGraph.getModuleById(filepath)?.transformResult || (await env.transformRequest(filepath));
    if (!transformed) return;
    modules.set(filepath, stableCode(filepath, transformed.code));
    for (const dep of [...(transformed.deps ?? []), ...(transformed.dynamicDeps ?? [])]) {
      const fsPath = dep.startsWith('/@fs/') ? dep.slice(4) : join(project.config.root, dep);
      const external = fsPath.includes('node_modules') || !existsSync(fsPath);
      const id = external ? externalId(dep.startsWith('/@fs/') ? relative(REPO_ROOT, fsPath) : dep) : '';
      const own = declared[relative(REPO_ROOT, filepath)];
      if ((UNCACHEABLE.test(dep) || READS_FILES.test(id)) && own) for (const input of own) inputs.add(input);
      else if (UNCACHEABLE.test(dep) || READS_FILES.test(id)) reasons.add(`imports ${id}`);
      if (external) externals.add(id);
      else await visit(fsPath);
    }
  };
  await visit(file);
  keyBundlesByRoots(modules);
  return {modules, externals, reasons, inputs};
}

const BUNDLE = /\/\.mion[^/]*\/types\/runtypes\.js$/;
const FACADE = /^export const __rt_\w+=\[5,.*,'([^']+)'\];$/m;
const INI_LINE = /^c\('([^']+)'\)\./;
const INI_REF = /c\('([^']+)'\)/g;

// The shared bundle holds every reflected type of the program, so a test is keyed only on the rows its facades reach.
function keyBundlesByRoots(modules) {
  for (const bundlePath of [...modules.keys()].filter((path) => BUNDLE.test(path))) {
    const dir = dirname(bundlePath);
    const roots = [];
    for (const path of modules.keys()) {
      if (dirname(path) !== dir || path === bundlePath) continue;
      const root = FACADE.exec(readFileSync(path, 'utf8'))?.[1];
      if (root) roots.push(root);
    }
    const digest = bundleDigest(readFileSync(bundlePath, 'utf8'), roots);
    if (digest) modules.set(bundlePath, `rows reached from ${roots.length} root(s): ${digest}`);
    else note(`test-skip: could not read ${relative(REPO_ROOT, bundlePath)}, keying on its whole text`);
  }
}

// Rows are followed by id, never by row index, so a row added elsewhere shifts nothing here; null means unreadable.
export function bundleDigest(code, rootIds) {
  let record;
  try {
    record = new Function(code.replace(/^export const __rt_runtypes=/m, 'return '))();
  } catch {
    return null;
  }
  const [rows, rels] = [record?.[4], record?.[5]];
  if (!Array.isArray(rows)) return null;
  const indexOf = new Map(rows.map((row, index) => [row[0], index]));
  const iniLines = new Map();
  for (const line of code.slice(0, code.search(/^export const __rt_runtypes=/m)).split('\n')) {
    const id = INI_LINE.exec(line)?.[1];
    if (id) iniLines.set(id, [...(iniLines.get(id) ?? []), line.replace(DRAWN_SAMPLES, '$1]')]);
  }
  const seen = new Set();
  const queue = [...rootIds];
  const parts = [];
  const byId = (value) => (typeof value === 'number' ? (rows[value]?.[0] ?? `#${value}`) : value);
  const edges = (value, out) => {
    if (typeof value === 'number') out.push(byId(value));
    else if (typeof value === 'string' && indexOf.has(value)) out.push(value);
    else if (Array.isArray(value)) for (const item of value) edges(item, out);
    else if (value && typeof value === 'object') for (const item of Object.values(value)) inlineEdges(item, out);
    return out;
  };
  // Numbers inside an inline literal are kinds and flags, not row indexes; only its id strings link rows.
  const inlineEdges = (value, out) => {
    if (typeof value === 'string' && indexOf.has(value)) out.push(value);
    else if (value && typeof value === 'object') for (const item of Object.values(value)) inlineEdges(item, out);
  };
  while (queue.length > 0) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    const index = indexOf.get(id);
    if (index === undefined) return null;
    const lines = iniLines.get(id) ?? [];
    const next = edges(rels?.[index], []);
    inlineEdges(rows[index].slice(1), next);
    for (const line of lines) for (const match of line.slice(line.indexOf(')') + 1).matchAll(INI_REF)) next.push(match[1]);
    parts.push([id, JSON.stringify(rows[index]), JSON.stringify(mapIndexes(rels?.[index], byId)) ?? '', ...lines].join('\n'));
    queue.push(...next.filter((target) => indexOf.has(target)));
  }
  return sha(...parts.sort());
}

// Swaps each row index in a rels row for the row's id, leaving inline literals untouched.
function mapIndexes(value, byId) {
  if (typeof value === 'number') return byId(value);
  if (Array.isArray(value)) return Array.from(value, (item) => mapIndexes(item, byId));
  return value;
}

const versions = new Map();
// The hoisted node_modules layout puts no version in a path, so an external is keyed as `name@version`.
export function externalId(path) {
  const match = PACKAGE.exec(path);
  if (!match) return path;
  const manifest = join(REPO_ROOT, match[1], match[2], 'package.json');
  if (!versions.has(manifest))
    versions.set(manifest, existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')).version : 'missing');
  return `${match[2]}@${versions.get(manifest)}`;
}

// Exported for the unit tests.
export function fileKey({modules, externals, inputs = new Set()}, salt) {
  const parts = [salt];
  for (const path of [...modules.keys()].sort()) parts.push(relative(REPO_ROOT, path), modules.get(path));
  parts.push(...[...externals].sort());
  for (const input of [...inputs].sort()) parts.push(input, inputDigest(input));
  return sha(...parts);
}

const inputDigests = new Map();
// The Go binaries by the digest of their sources (the CI cache key), a file by its bytes, a directory by every file in it.
export function inputDigest(input) {
  if (inputDigests.has(input)) return inputDigests.get(input);
  const digest = input === GO_BINS ? goBinCacheKey() : pathDigest(join(REPO_ROOT, input));
  inputDigests.set(input, digest);
  return digest;
}

function pathDigest(path) {
  if (!existsSync(path)) return 'missing';
  if (!statSync(path).isDirectory()) return sha(readFileSync(path));
  const parts = [];
  for (const name of readdirSync(path, {recursive: true}).map(String).sort()) {
    const file = join(path, name);
    if (statSync(file).isFile()) parts.push(name, readFileSync(file));
  }
  return sha(...parts);
}

// What changes a result but no import records: toolchain, configs, fuzz seeds.
function baseSalt(vitest) {
  const fuzzEnv = Object.keys(process.env)
    .filter((name) => name.startsWith('MION_FUZZ_'))
    .sort()
    .map((name) => `${name}=${process.env[name]}`);
  const read = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : '');
  return sha(
    process.version,
    vitest.version,
    read(join(REPO_ROOT, 'vitest.config.ts')),
    read(join(REPO_ROOT, 'version.json')),
    ...fuzzEnv
  );
}

// Setup files run around every test file, so their graphs join every key and their reasons block every file.
export async function projectSalt(project, base, declared = DECLARED) {
  const setups = [
    project.config.config ?? '',
    ...(project.config.setupFiles ?? []),
    ...(project.config.globalSetup ?? []),
  ].filter((path) => path && existsSync(path));
  const parts = [base, project.name];
  let reason = '';
  for (const setup of setups) {
    const graph = await moduleGraph(project, setup, declared);
    parts.push(fileKey(graph, ''));
    if (!reason && graph.reasons.size > 0) reason = `setup ${relative(REPO_ROOT, setup)} ${[...graph.reasons][0]}`;
  }
  return {salt: sha(...parts), reason};
}

const specId = (project, moduleId) => `${project.name}::${relative(REPO_ROOT, moduleId)}`;

// A set `reason` means never cache that file.
async function specKeys(vitest, specs) {
  const base = baseSalt(vitest);
  const salts = new Map();
  const keys = {};
  for (const spec of specs) {
    if (!salts.has(spec.project)) salts.set(spec.project, await projectSalt(spec.project, base));
    const {salt, reason: setupReason} = salts.get(spec.project);
    const graph = await moduleGraph(spec.project, spec.moduleId);
    const reason = TIME_BOXED.test(spec.moduleId) ? 'time-boxed fuzz' : ([...graph.reasons][0] ?? setupReason);
    keys[specId(spec.project, spec.moduleId)] = {key: fileKey(graph, salt), reason};
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
  // Sets the reporters up; a run started without it crashes the default reporter at the end.
  if (reporters.length > 0) await vitest.standalone();
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
      if (testModule.state() === 'failed') failed.add(id);
      else if (testModule.state() === 'passed' && tests.length > 0 && tests.every((test) => test.result().state === 'passed'))
        passed.add(id);
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
  note(
    `test-skip: ${specs.length} file(s) keyed in ${Math.round(performance.now() - started)} ms, ${uncached} never cached -> ${relative(REPO_ROOT, out)}`
  );
}

// A failed file the list would have skipped: its key misses an input.
export const missedInputs = (store, keys, failed) => [...failed].filter((id) => keys[id] && isProven(store, id, keys[id])).sort();

async function runSkipping({store: storePath, audit, ...scope}) {
  const recorder = passRecorder();
  const {vitest, specs} = await openVitest({...scope, reporters: [recorder.reporter]});
  const keys = await specKeys(vitest, specs);
  const store = readStore(storePath);
  const proven = (spec) => isProven(store, specId(spec.project, spec.moduleId), keys[specId(spec.project, spec.moduleId)]);
  const toRun = audit ? specs : specs.filter((spec) => !proven(spec));
  const skippable = specs.filter(proven).length;
  note(
    `test-skip: ${specs.length} file(s), ${skippable} already passed at these exact inputs, running ${toRun.length}${audit ? ' (audit)' : ''}`
  );
  if (toRun.length > 0) await vitest.runTestSpecifications(toRun, toRun.length === specs.length);
  const unhandled = vitest.state.getUnhandledErrors().length;
  await vitest.close();
  // An unhandled error belongs to no file, so nothing from that run is trusted.
  if (unhandled === 0) {
    for (const id of recorder.passed) if (keys[id] && !keys[id].reason) recordPass(store, id, keys[id].key);
    mkdirSync(dirname(storePath), {recursive: true});
    writeFileSync(storePath, `${JSON.stringify(store)}\n`);
  }
  const missed = audit ? missedInputs(store, keys, recorder.failed) : [];
  if (missed.length > 0)
    die(
      `core test-skip --audit: ${missed.length} failed file(s) the passed list would have skipped, so their keys miss an input:\n  ${missed.join('\n  ')}`
    );
  if (recorder.failed.size > 0 || unhandled > 0)
    die(`core test-skip: ${recorder.failed.size} file(s) failed, ${unhandled} unhandled error(s)`);
}

export function parseCli(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        keys: {type: 'string'},
        store: {type: 'string'},
        audit: {type: 'boolean'},
        project: {type: 'string', multiple: true},
        exclude: {type: 'string', multiple: true},
      },
    });
  } catch (err) {
    die(`core test-skip: ${err.message}`, 2);
  }
  const {values, positionals} = parsed;
  return {
    keys: values.keys,
    store: values.store ?? DEFAULT_STORE,
    audit: values.audit ?? false,
    scope: {filters: positionals, projects: values.project ?? [], excludes: values.exclude ?? []},
  };
}

export async function main(argv = []) {
  const cli = parseCli(argv);
  if (cli.keys) return writeKeys(cli.keys, cli.scope);
  return runSkipping({...cli.scope, store: cli.store, audit: cli.audit});
}

if (import.meta.main) {
  try {
    await main(process.argv.slice(2));
  } catch (err) {
    reportCliError(err);
  }
}
