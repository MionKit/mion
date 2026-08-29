// run-suite.mjs — the whole drizzle-e2e lane, inside the container.
//
// Six steps, every run, so nothing is ever carried over from a previous one:
//
//   1. install the packages UNDER TEST from the in-container verdaccio
//   2. stage the pinned suites (bind-mounted, already sha256-verified on the host)
//   3. translate them with `ts-runtypes drizzle-migrate`
//   4. copy in the runner, the addendum and the skip list
//   5. start the database, run vitest against it, then typecheck the tree
//   6. assert coverage: every migrated manifest entry the dialect has must have
//      been rewritten by the translation
//
// Step 1 is what makes this an e2e rather than a unit test: `@ts-runtypes/bin`
// resolves its linux `@ts-runtypes/binary-<arch>` optional dependency, so the
// translator that runs here is the one that ships.
//
// Nothing here is bind-mounted read-write. The translated tree lives in /work,
// which is container-local and thrown away with the container.
import {execFileSync, spawnSync} from 'node:child_process';
import {cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {splitBaseline} from '/drizzle-src/baseline.mjs';

const DIALECT = process.env.RT_DRIZZLE_DIALECT ?? '';
const VERSION = process.env.RT_DRIZZLE_VERSION ?? '';
const REGISTRY = process.env.RT_DRIZZLE_REGISTRY ?? 'http://127.0.0.1:4873';
const SRC = '/drizzle-src'; // container/drizzle-e2e/shared, read-only
const SUITES = '/suites'; // .cache/drizzle-suites/<tag>, read-only
const HOME = '/drizzle-e2e'; // the baked install
// INSIDE the install, not beside it: vitest, tsc and the translated tree all
// resolve their modules by walking up from here, and only this path reaches
// /drizzle-e2e/node_modules.
const WORK = '/drizzle-e2e/work';
// The untranslated twin of WORK, run against the same database (see step 5).
const CONTROL = '/drizzle-e2e/control';
const OUT = '/out'; // report + logs, written back to the host

const DIALECTS = {
  pg: {suite: 'pg', common: 'pg-common.ts', manifests: ['pg', 'root']},
  mysql: {suite: 'mysql', common: 'mysql-common.ts', manifests: ['mysql', 'root']},
  sqlite: {suite: 'sqlite', common: 'sqlite-common.ts', manifests: ['sqlite', 'root']},
};

const spec = DIALECTS[DIALECT];
if (!spec) {
  console.error(`run-suite: RT_DRIZZLE_DIALECT must be one of ${Object.keys(DIALECTS).join(' | ')}, got '${DIALECT}'`);
  process.exit(2);
}
const step = (message) => console.log(`\n==> [${DIALECT}] ${message}`);
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, {stdio: 'inherit', cwd: HOME, ...opts});

// ── 1. the packages under test, from verdaccio ──────────────────────────────
step('installing the packages under test from verdaccio');
if (!VERSION) throw new Error('run-suite: RT_DRIZZLE_VERSION is not set (the version the tarballs were packed at)');
// npm, not pnpm: the two disagree about the baked tree. pnpm `add` re-resolves
// the whole manifest and prunes what it thinks is unused (it removed vitest and
// the driver), and then does not exit. npm leaves the tree alone.
//
// drizzle-orm is named EXPLICITLY, at the pinned version, even though the image
// already bakes it: npm reads a pnpm-installed dependency as
// `drizzle-orm@undefined` and then fails the slim packages' optional peer
// against that. Naming it gives npm a concrete version to satisfy the peer with,
// which is the honest fix — the peer really is satisfied.
const drizzleVersion = process.env.RT_DRIZZLE_ORM_VERSION ?? '';
if (!drizzleVersion) throw new Error('run-suite: RT_DRIZZLE_ORM_VERSION is not set (the drizzle-orm version the suites are pinned to)');
run('npm', [
  'install',
  '--no-save',
  '--registry',
  REGISTRY,
  `@ts-runtypes/bin@${VERSION}`,
  `@mionjs/drizzle-orm@${process.env.RT_DRIZZLE_PKG_VERSION ?? VERSION}`,
  `@mionjs/drizzle-orm-${DIALECT}-core@${process.env.RT_DRIZZLE_PKG_VERSION ?? VERSION}`,
  `drizzle-orm@${drizzleVersion}`,
]);
// The LAUNCHER, not the platform binary: `ts-runtypes-bin` resolves whichever
// @ts-runtypes/binary-<os>-<arch> npm installed as an optional dependency. Going
// through it is the point — it is the resolution a consumer gets.
const binary = path.join(HOME, 'node_modules', '.bin', 'ts-runtypes-bin');
if (!existsSync(binary)) throw new Error(`run-suite: ${binary} is missing after the install — @ts-runtypes/bin did not install its launcher`);

// ── 2. stage the pinned suites ──────────────────────────────────────────────
step('staging the pinned drizzle suites');
rmSync(WORK, {recursive: true, force: true});
mkdirSync(WORK, {recursive: true});
cpSync(path.join(SUITES, 'tests'), path.join(WORK, 'tests'), {recursive: true});
// Only this dialect's suite is translated and run; the other two would need
// their own drivers and database.
for (const other of Object.keys(DIALECTS)) {
  if (other !== DIALECT) rmSync(path.join(WORK, 'tests', DIALECTS[other].suite), {recursive: true, force: true});
}
// The vendored suites are a SUBSET of drizzle's tree, so they reference a file
// or two the lane does not carry. Stub those, or the typecheck gate goes red on
// something no recorder can fix (see stubs/pg/neon-http-batch.test.ts).
const stubs = path.join(SRC, 'stubs', spec.suite);
if (existsSync(stubs)) cpSync(stubs, path.join(WORK, 'tests', spec.suite), {recursive: true});
cpSync(path.join(SRC, 'tsconfig.json'), path.join(WORK, 'tsconfig.json'));
cpSync(path.join(SRC, 'vitest.config.ts'), path.join(WORK, 'vitest.config.ts'));

// The CONTROL: the same suite, NOT translated, run against the same database
// with drizzle itself. It is what turns "this failure is not ours" from a claim
// into a measurement — a test that fails identically before and after the
// translation cannot have been broken by the translation.
step('staging the untranslated control');
rmSync(CONTROL, {recursive: true, force: true});
mkdirSync(CONTROL, {recursive: true});
cpSync(path.join(WORK, 'tests'), path.join(CONTROL, 'tests'), {recursive: true});
cpSync(path.join(SRC, 'tsconfig.json'), path.join(CONTROL, 'tsconfig.json'));
cpSync(path.join(SRC, 'vitest.config.ts'), path.join(CONTROL, 'vitest.config.ts'));

// ── 3. translate ────────────────────────────────────────────────────────────
step('translating onto the slim packages');
mkdirSync(OUT, {recursive: true});
const reportFile = path.join(OUT, `${DIALECT}-report.json`);
const translate = spawnSync(binary, ['drizzle-migrate', '--tsconfig', path.join(WORK, 'tsconfig.json'), '--report', reportFile, path.join(WORK, 'tests')], {
  cwd: HOME,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
process.stdout.write(translate.stdout ?? '');
process.stderr.write(translate.stderr ?? '');
if (translate.error) throw translate.error;
if (!existsSync(reportFile)) throw new Error('run-suite: the translator wrote no report');
const report = JSON.parse(readFileSync(reportFile, 'utf8'));
// A refusal is EXPECTED and named: the refused declaration stays valid drizzle,
// so the test still runs. Only the coverage gate below decides whether the
// refusals cost us anything.
console.log(`-> translated with ${report.refusals?.length ?? 0} refusal(s)`);

// ── 4. the runner, the addendum and the skip list ───────────────────────────
step('adding the runner and the addendum');
const suiteDir = path.join(WORK, 'tests', spec.suite);
// AFTER the translation on purpose: these talk to drizzle directly and are
// already written against the slim packages, so translating them would be wrong.
cpSync(path.join(SRC, 'runners', `${DIALECT}.test.ts`), path.join(suiteDir, `mion-${DIALECT}.test.ts`));
cpSync(path.join(SRC, 'addendum', `${DIALECT}.test.ts`), path.join(suiteDir, `mion-${DIALECT}-addendum.test.ts`));
// The control gets the same runner. Neither side skips anything: what a test
// does is compared, not asserted.
cpSync(path.join(SRC, 'runners', `${DIALECT}.test.ts`), path.join(CONTROL, 'tests', spec.suite, `mion-${DIALECT}.test.ts`));

// ── 5. the database, then the tests ─────────────────────────────────────────
step('starting the database');
startDatabase();

step('running the translated suite');
// The JSON reporter writes the per-test outcome beside the human output, which
// is what makes "the suite skipped exactly what the list names" checkable.
const resultsFile = path.join(OUT, `${DIALECT}-results.json`);
const vitest = spawnSync(
  'npx',
  ['vitest', 'run', '--root', WORK, '--config', path.join(WORK, 'vitest.config.ts'), '--reporter=default', '--reporter=json', '--outputFile', resultsFile],
  {cwd: HOME, stdio: 'inherit', env: {...process.env, NODE_OPTIONS: '--max-old-space-size=4096'}}
);
// The control runs SECOND, against the same database, so any table the
// translated run left behind is already there — which is what the untranslated
// suite would have found on a rerun anyway.
step('running the untranslated control');
const controlResults = path.join(OUT, `${DIALECT}-control-results.json`);
spawnSync(
  'npx',
  ['vitest', 'run', '--root', CONTROL, '--config', path.join(CONTROL, 'vitest.config.ts'), '--reporter=json', '--outputFile', controlResults],
  {cwd: HOME, stdio: ['inherit', 'ignore', 'inherit'], env: {...process.env, NODE_OPTIONS: '--max-old-space-size=4096'}}
);

// The VERDICT is the comparison, not either run's exit status. A test that
// fails on drizzle's own code against this driver is not something the slim
// packages can fix, and skipping it by hand would only move the judgement into a
// list someone has to keep honest. Running both and demanding the SAME outcome
// needs no list and no judgement at all.
const suiteFailed = assertSameOutcomesAsControl(resultsFile, controlResults);

step('typechecking the translated tree');
const typecheckFailed = typecheck();

// ── 6. coverage ─────────────────────────────────────────────────────────────
step('checking manifest coverage');
const coverageFailed = checkCoverage(report, suiteDir, resultsFile);

writeFileSync(
  path.join(OUT, `${DIALECT}-summary.json`),
  `${JSON.stringify({dialect: DIALECT, suiteFailed, typecheckFailed, coverageFailed, refusals: report.refusals ?? []}, null, 2)}\n`
);
if (suiteFailed || typecheckFailed || coverageFailed) {
  console.error(`\n==> [${DIALECT}] FAILED (suite: ${!suiteFailed}, typecheck: ${!typecheckFailed}, coverage: ${!coverageFailed} — true means passed)`);
  process.exit(1);
}
console.log(`\n==> [${DIALECT}] the translated suite is green against a real database`);

// ── helpers ─────────────────────────────────────────────────────────────────


// Per-test outcome, keyed by full name, from vitest's JSON report.
function outcomes(resultsFile) {
  if (!existsSync(resultsFile)) return new Map();
  const results = JSON.parse(readFileSync(resultsFile, 'utf8'));
  const byName = new Map();
  for (const file of results.testResults ?? []) {
    for (const test of file.assertionResults ?? []) byName.set(test.fullName ?? test.title, test.status);
  }
  return byName;
}

// THE verdict: the translation must not change any test's outcome.
//
// Every test is run twice against the same database — once translated onto the
// slim packages, once on drizzle's own code — and the two must agree. That makes
// the lane's claim exact: not "the suite is green", which drizzle's own suite is
// not against every driver, but "the translation changed nothing".
//
// It also means there is no skip list. A test that fails both ways is drizzle's
// limitation against this driver (better-sqlite3 rejects an async transaction
// callback; the migrator test reads files this lane does not vendor), and a
// hand-kept list of those is just an unproven claim. The control proves it.
//
// Our own addendum only exists in the translated tree, so it is compared against
// nothing and simply has to pass.
function assertSameOutcomesAsControl(resultsFile, controlResults) {
  const after = outcomes(resultsFile);
  const before = outcomes(controlResults);
  if (before.size === 0) {
    console.error('run-suite: the control produced no results, so nothing can be attributed. Refusing to pass on that.');
    return true;
  }
  const differ = [];
  const ownFailures = [];
  for (const [name, status] of after) {
    if (!before.has(name)) {
      // Ours (the addendum). It answers to itself.
      if (status !== 'passed') ownFailures.push(`${name}: ${status}`);
      continue;
    }
    if (before.get(name) !== status) differ.push(`${name}: drizzle ${before.get(name)}, translated ${status}`);
  }
  for (const name of before.keys()) if (!after.has(name)) differ.push(`${name}: present on drizzle's code, MISSING after translation`);
  const tally = (map) => {
    const counts = {};
    for (const status of map.values()) counts[status] = (counts[status] ?? 0) + 1;
    return Object.entries(counts).map(([status, n]) => `${n} ${status}`).join(', ');
  };
  console.log(`-> drizzle's own code: ${tally(before)}`);
  console.log(`-> translated:         ${tally(after)} (includes this lane's addendum)`);
  if (ownFailures.length > 0) console.error(`run-suite: the addendum failed:\n  ${ownFailures.join('\n  ')}`);
  if (differ.length > 0) {
    console.error(`run-suite: ${differ.length} test(s) whose outcome the translation CHANGED:\n  ${differ.join('\n  ')}`);
  }
  if (differ.length === 0 && ownFailures.length === 0) {
    console.log('-> every vendored test has the same outcome before and after the translation');
    return false;
  }
  return true;
}



// Bring up the dialect's server and export the connection variable the suite
// reads. drizzle's runners prefer these over their own createDockerDB(), which
// is what keeps this lane free of docker-in-docker.
function startDatabase() {
  if (DIALECT === 'sqlite') {
    const dbPath = '/tmp/drizzle-e2e.sqlite';
    rmSync(dbPath, {force: true});
    process.env.SQLITE_DB_PATH = dbPath;
    console.log(`-> sqlite database file at ${dbPath}`);
    return;
  }
  if (DIALECT === 'pg') {
    // The official entrypoint initialises the cluster on first boot; it runs as
    // postgres, and this script runs as root, so su-exec through gosu is what
    // the image itself does.
    spawnSync('bash', ['-c', 'docker-entrypoint.sh postgres >/tmp/postgres.log 2>&1 &'], {stdio: 'inherit'});
    waitFor(() => spawnSync('pg_isready', ['-h', '127.0.0.1', '-p', '5432']).status === 0, 'postgres', '/tmp/postgres.log');
    process.env.PG_CONNECTION_STRING = 'postgres://postgres:postgres@127.0.0.1:5432/postgres';
    return;
  }
  spawnSync('bash', ['-c', 'docker-entrypoint.sh mysqld >/tmp/mysql.log 2>&1 &'], {stdio: 'inherit'});
  waitFor(
    () => spawnSync('mysqladmin', ['ping', '-h', '127.0.0.1', '-P', '3306', '-uroot', '-pdrizzle'], {stdio: 'ignore'}).status === 0,
    'mysql',
    '/tmp/mysql.log'
  );
  process.env.MYSQL_CONNECTION_STRING = 'mysql://root:drizzle@127.0.0.1:3306/drizzle';
}

function waitFor(ready, what, logFile) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (ready()) {
      console.log(`-> ${what} is up`);
      return;
    }
    execFileSync('sleep', ['1']);
  }
  if (existsSync(logFile)) console.error(readFileSync(logFile, 'utf8').slice(-4000));
  throw new Error(`run-suite: ${what} did not become ready within 180s`);
}

// The typecheck is a gate, not a warning: a translated tree that does not
// typecheck means a consumer following the same migration would not compile.
// The baseline names what is EXPECTED to differ, with a reason each.
function typecheck() {
  const result = spawnSync('npx', ['tsc', '--noEmit', '-p', path.join(WORK, 'tsconfig.json')], {cwd: HOME, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
  const lines = `${result.stdout ?? ''}${result.stderr ?? ''}`.split('\n').filter((line) => /error TS\d+:/.test(line));
  writeFileSync(path.join(OUT, `${DIALECT}-typecheck.log`), `${lines.join('\n')}\n`);
  const baseline = JSON.parse(readFileSync(path.join(SRC, 'typecheck-baseline.json'), 'utf8'));
  const {expected, skipped, unexpected} = splitBaseline(baseline, lines);
  console.log(`-> ${unexpected.length} unexpected, ${expected.length} expected by the baseline, ${skipped.length} environmental`);
  if (skipped.length > 0) {
    // The container installs every dependency the suites import, so an
    // environmental error here means the image's _deps went stale.
    console.error(`run-suite: ${skipped.length} missing-module error(s) — this image installs them all, so its _deps/package.json is out of date:`);
    console.error(skipped.slice(0, 10).join('\n'));
    return true;
  }
  // NOT checked here: whether a baseline pattern matches nothing. The baseline
  // is shared by all three dialects while this run sees ONE, and a pattern for a
  // pg-only construct legitimately matches nothing under sqlite. The host lane
  // (scripts/core/drizzle-translate.mjs) translates all three suites into one
  // tree, so it is the only place that can tell a dead row from an absent one.
  if (unexpected.length === 0) return false;
  console.error(`run-suite: ${unexpected.length} type error(s) the baseline does not explain:`);
  console.error(unexpected.slice(0, 40).join('\n'));
  console.error('Either fix them, or add a reason-tagged pattern to container/drizzle-e2e/shared/typecheck-baseline.json.');
  return true;
}

// Cross the translation report against the manifests: every entry marked
// `migrated` must be exercised against the real database, or nothing proved it
// works. Two sources count — what the TRANSLATION rewrote, and what the
// addendum spells directly (it is already written against the slim packages, so
// it never passes through the translator and cannot appear in the report).
//
// The manifests are not in the published tarballs, so the host writes them into
// the mounted output dir as one file before the run.
function checkCoverage(report, suiteDir, resultsFile) {
  const missing = [];
  const addendum = readFileSync(path.join(SRC, 'addendum', `${DIALECT}.test.ts`), 'utf8');
  const manifests = JSON.parse(readFileSync(path.join(OUT, 'manifests.json'), 'utf8'));
  const suite = readFileSync(path.join(suiteDir, spec.common), 'utf8');
  const notPassed = notPassedTestSpans(suite, resultsFile);
  const slimLocals = slimImportLocals(suite);
  for (const manifest of spec.manifests) {
    const entries = (manifests[manifest] ?? []).filter((entry) => entry.status === 'migrated');
    const used = new Set(report.used?.[manifest] ?? []);
    for (const entry of entries) {
      // The report says the TRANSLATION rewrote it. That is not the same as a
      // test having RUN it: a builder whose every use sits inside a skipped test
      // proves nothing, and the spec's bar is "exercised by at least one
      // EXECUTED test against a real database".
      // Scan for the LOCAL the translation bound from OUR package, not the
      // manifest's export name: `sql` arrives as `rtSql`, and scanning for `sql`
      // would count drizzle's own 28 uses as evidence that ours ran.
      const local = slimLocals.get(entry.fn);
      if (used.has(entry.fn) && local && usedOutsideSpans(suite, local, notPassed)) continue;
      // A bare name match would count an import or a comment, so require the
      // name to be CALLED: `(` for a plain call, `<` for a generic one
      // (customType is always written `customType<{...}>({...})`), or a backtick
      // for a tagged template (sql`…`).
      if (new RegExp(`\\b${entry.fn}\\s*[(<\`]`).test(addendum)) continue;
      missing.push(`${manifest}.${entry.fn}`);
    }
  }
  if (missing.length === 0) {
    console.log('-> every migrated manifest entry was exercised');
    return false;
  }
  console.error(
    `run-suite: ${missing.length} migrated manifest entr(ies) were never exercised by a test that actually RAN.\n` +
      `Either the translation never rewrote them, or every use sits inside a skipped test. Add them to ` +
      `container/drizzle-e2e/shared/addendum/${DIALECT}.test.ts so they hit a real database:\n  ${missing.join('\n  ')}`
  );
  return true;
}

// The source spans of the tests that did NOT pass, read from the run's own
// results rather than from a list. A builder whose every use sits inside a test
// that failed proves nothing, and the spec's bar is "exercised by at least one
// EXECUTED test against a real database".
//
// A span runs from a test's own declaration to the NEXT test's, NOT by matching
// brackets. Bracket matching looks obvious and is wrong here: an apostrophe in a
// comment ("// don't") opens a string the walker never closes, and every span
// then swallows the tests after it. It is deliberately conservative at the seams,
// which can only make the gate ASK FOR MORE, never less.
function notPassedTestSpans(suite, resultsFile) {
  const failing = new Set();
  for (const [name, status] of outcomes(resultsFile)) if (status !== 'passed') failing.add(name.split(' > ').pop());
  if (failing.size === 0) return [];
  const declaration = /(?:^|\n)\s*(?:test|it)(?:\.\w+)?\s*\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
  const declarations = [];
  for (let match = declaration.exec(suite); match !== null; match = declaration.exec(suite)) {
    declarations.push({at: match.index, name: match[2]});
  }
  const spans = [];
  for (let index = 0; index < declarations.length; index++) {
    if (!failing.has(declarations[index].name)) continue;
    spans.push([declarations[index].at, declarations[index + 1]?.at ?? suite.length]);
  }
  return spans;
}

// At least one CALL of this binding must sit outside every span above.
function usedOutsideSpans(suite, local, spans) {
  const call = new RegExp(`\\b${local}\\s*[(<\`]`, 'g');
  for (let match = call.exec(suite); match !== null; match = call.exec(suite)) {
    if (!spans.some(([start, end]) => match.index >= start && match.index < end)) return true;
  }
  return false;
}

// What each migrated export is BOUND TO in the translated file, read from its
// imports of the slim packages. This is what makes the scan above honest for an
// aliased export: `sql` arrives as `rtSql`, and drizzle's own `sql` stays in the
// same file, so the export name alone cannot tell the two apart.
function slimImportLocals(suite) {
  const locals = new Map();
  const statement = /import\s*\{([^}]*)\}\s*from\s*['"]@mionjs\/[^'"]*['"]/g;
  for (let match = statement.exec(suite); match !== null; match = statement.exec(suite)) {
    for (const binding of match[1].split(',')) {
      const [exported, local] = binding.trim().replace(/^type\s+/, '').split(/\s+as\s+/);
      if (exported) locals.set(exported.trim(), (local ?? exported).trim());
    }
  }
  return locals;
}
