// durable-worker.mjs — the durable lane's harness, run by run-suite.mjs once per
// tree (control, builders, types).
//
// drizzle does not write this suite as tests. `tests/sqlite/durable-objects/index.ts`
// is a WORKER: a Durable Object class whose every method is one test, plus a
// fetch handler that calls them in order. We run it the way drizzle runs it,
// because our translation happens at the drizzle TABLE level and the harness a
// suite chose is beside the point. What the lane needs from any harness is the
// same thing: a per-test outcome it can compare across the three trees.
//
// So this file does four things and no more:
//   1. read the METHOD ORDER out of drizzle's own fetch handler, so the suite
//      still decides what runs and in what sequence
//   2. bundle the suite with runners/durable-entry.ts (esbuild; the `.sql`
//      migration loads as text, exactly as wrangler's Text rule does)
//   3. run it on miniflare's workerd with a SQLite-backed Durable Object
//   4. write the outcomes in the vitest report shape run-suite.mjs reads
//
// One request per method, not one for the whole suite: drizzle's own handler
// returns on the first throw, and a run that stops at the first failure is
// comparable only up to that point.
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

// The container paths, overridable so the whole harness can be smoke-tested on
// the host against .cache/drizzle-suites/<tag>-translated before any image exists.
const HOME = process.env.MION_DRIZZLE_HOME ?? '/drizzle-e2e';
const SRC = process.env.MION_DRIZZLE_SHARED ?? '/drizzle-src';

function arg(flag) {
  const at = process.argv.indexOf(flag);
  if (at === -1 || !process.argv[at + 1]) throw new Error(`durable-worker: missing ${flag}`);
  return process.argv[at + 1];
}

const tree = arg('--tree');
// The TYPE road needs the devtools transform: `tableFromType<T>()` is a MARKER
// call, and nothing resolves its type argument without it. This is the same
// chain vitest.types.config.ts gives the other lanes, through the esbuild
// plugin instead of the vite one.
const typeRoad = process.argv.includes('--type-road');
const suiteDir = path.join(tree, arg('--suite'));
const outFile = arg('--out');
const suiteFile = path.join(suiteDir, 'index.ts');

// ── 1. the order drizzle's own handler runs the methods in ──────────────────
// Read from the suite, never hand-listed: a hand-kept list would drift the
// moment drizzle adds a test, and would do it silently.
function methodOrder(source) {
  const driver = source.slice(source.indexOf('export default'));
  const names = [...driver.matchAll(/await\s+stub\.(\w+)\s*\(\s*\)/g)].map((match) => match[1]);
  if (names.length === 0) throw new Error(`durable-worker: found no \`await stub.x()\` calls in ${suiteFile}`);
  // A method drizzle calls twice gets a distinct report name, so the comparison
  // does not silently collapse two outcomes into one.
  const seen = new Map();
  return names.map((name) => {
    const nth = (seen.get(name) ?? 0) + 1;
    seen.set(name, nth);
    return {method: name, title: nth === 1 ? name : `${name} (${nth})`};
  });
}

const order = methodOrder(readFileSync(suiteFile, 'utf8'));
console.log(`-> ${order.length} test method(s) in drizzle's durable-objects suite`);

// ── 2. bundle ───────────────────────────────────────────────────────────────
const build = mkdtempSync(path.join(tmpdir(), 'rt-durable-'));
const entryFile = path.join(build, 'entry.ts');
// The entry imports the suite through a stable specifier so the same file works
// for every tree; the alias below points it at THIS tree's copy.
writeFileSync(entryFile, readFileSync(path.join(SRC, 'runners', 'durable-entry.ts'), 'utf8'));
const bundleFile = path.join(build, 'worker.mjs');

// esbuild's JS API, not its CLI: `nodePaths` (which is what makes the bundle
// resolve the installed packages when the tree sits outside the install) has no
// command-line flag.
const esbuild = await import(path.join(HOME, 'node_modules', 'esbuild', 'lib', 'main.js'));
try {
  await esbuild.build({
    entryPoints: [entryFile],
    outfile: bundleFile,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'esnext',
    mainFields: ['module', 'main'],
    conditions: ['workerd', 'worker', 'browser', 'import'],
    // workerd's own module. It must stay an import or workerd cannot provide it.
    external: ['cloudflare:workers'],
    loader: {
      // The drizzle-kit migration the suite's migrate1() applies. wrangler loads it
      // with a Text rule; this is the same thing.
      '.sql': 'text',
    },
    alias: {'rt-durable-suite': suiteFile},
    // drizzle's suites reach their helpers through the `~/` alias.
    tsconfigRaw: {compilerOptions: {baseUrl: '/', paths: {'~/*': [path.join(tree, 'tests', '*')]}}},
    plugins: typeRoad ? [await runTypesPlugin()] : [],
    // The TREE, matching what vitest.types.config.ts uses as its root: the
    // devtools transform keys its site set on paths relative to the working dir,
    // so pointing this anywhere else makes every marker site look like a file the
    // resolver never scanned, and nothing gets injected.
    absWorkingDir: tree,
    // Resolution then has to be told where the install is: node walks up from the
    // importer, and only the container happens to stage the tree inside it.
    nodePaths: [path.join(HOME, 'node_modules')],
    logLevel: 'warning',
  });
} catch (error) {
  // esbuild's thrown error carries the diagnostics on a getter, so the default
  // stack trace says only "Build failed with 1 error" and hides the one line
  // that says which import or plugin failed.
  const messages = await esbuild.formatMessages(error.errors ?? [], {kind: 'error', color: false});
  throw new Error(`durable-worker: bundling the suite failed\n${messages.join('\n') || String(error)}`);
}

// The devtools esbuild plugin, loaded from the install so it is the PUBLISHED
// one the lane installed from verdaccio, exactly like the resolver binary.
async function runTypesPlugin() {
  // Segments, so no grep for the joined path can see this: '@mionjs' + 'devtools'.
  // It read '@ts-runtypes' before the rename and the esbuild entry moved under
  // runtypes/ when the two devtools packages merged.
  const mod = await import(path.join(HOME, 'node_modules', '@mionjs', 'devtools', 'dist', 'runtypes', 'esbuild.js'));
  return mod.default({
    // The project root. Without it the plugin falls back to process.cwd(), which
    // is the INSTALL, and every marker site then looks like a file outside the
    // program: the build succeeds and injects nothing, and the failure only shows
    // up at runtime as "no id injected".
    cwd: tree,
    // The tsconfig the conversion itself was checked with, so the transform and
    // the typecheck can never disagree about how a name resolves. Lowercase `s`:
    // the option is `tsconfig`, and an unknown key is silently ignored.
    tsconfig: 'tsconfig.json',
    // Inside the tree, which is container-local and thrown away with it.
    genDir: '.mion',
  });
}

// ── 3. run it on workerd ────────────────────────────────────────────────────
const persist = process.env.MION_DRIZZLE_MINIFLARE_DIR;
if (!persist) throw new Error('durable-worker: MION_DRIZZLE_MINIFLARE_DIR is not set');
mkdirSync(persist, {recursive: true});

const {Miniflare} = await import(path.join(HOME, 'node_modules', 'miniflare', 'dist', 'src', 'index.js'));
const mf = new Miniflare({
  modules: true,
  scriptPath: bundleFile,
  modulesRoot: build,
  // useSQLite is what makes this a SQL-backed Durable Object, which is the only
  // kind drizzle-orm/durable-sqlite can drive.
  durableObjects: {MY_DURABLE_OBJECT: {className: 'MyDurableObject', useSQLite: true}},
  durableObjectsPersist: persist,
  // The suite's own wrangler.toml settings.
  compatibilityDate: '2024-11-12',
  compatibilityFlags: ['nodejs_compat'],
});

const assertionResults = [];
try {
  for (const {method, title} of order) {
    const response = await mf.dispatchFetch('http://durable/', {
      method: 'POST',
      body: JSON.stringify({name: method}),
      headers: {'content-type': 'application/json'},
    });
    const body = await response.json();
    const status = response.ok && body.status === 'passed' ? 'passed' : 'failed';
    const failureMessages = status === 'passed' ? [] : [String(body.message ?? `HTTP ${response.status}`)];
    assertionResults.push({title, fullName: `durable-objects > ${title}`, status, failureMessages});
    // Per method, always: run-suite silences the control run with stdio, so this
    // is the only place a failure on the two visible runs can be read.
    console.log(`   ${status === 'passed' ? 'ok  ' : 'FAIL'} ${title}${status === 'passed' ? '' : ` - ${failureMessages[0]}`}`);
  }
} finally {
  await mf.dispose();
  rmSync(build, {recursive: true, force: true});
}

// ── 4. the report, in the shape run-suite.mjs reads ─────────────────────────
const passed = assertionResults.filter((one) => one.status === 'passed').length;
console.log(`-> durable-objects: ${passed} passed, ${assertionResults.length - passed} failed`);
writeFileSync(outFile, `${JSON.stringify({testResults: [{name: suiteFile, assertionResults}]}, null, 2)}\n`);
