// run-suite.mjs — the whole drizzle-e2e lane, inside the container.
//
// Every run, so nothing is ever carried over from a previous one:
//
//   1. install the packages UNDER TEST from the in-container verdaccio
//   2. stage the pinned suites (bind-mounted, already sha256-verified on the host)
//   3. translate them with `ts-runtypes drizzle-migrate`
//   4. copy in the runner and the addendum
//   5. convert the translated tree again, onto the pure-type road
//   6. start the database, run all THREE trees against it, then typecheck them
//   7. assert coverage on both roads: every migrated manifest entry the dialect
//      has must have been exercised by a test that actually passed
//
// THREE trees, one control:
//
//   CONTROL  drizzle's own code                     -> its own database
//   WORK     drizzle-migrate onto the slim builders -> its own database
//   TYPES    WORK + `convert --to type`             -> its own database
//
// The verdict for both roads is the same comparison against the same control.
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
import {diffTypeErrors, errorLines} from '/drizzle-src/baseline.mjs';

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
// The untranslated twin of WORK, run against its own database (see step 6).
const CONTROL = '/drizzle-e2e/control';
// WORK converted onto the pure-type road: `PgTable<'users', {...}>` plus
// `tableFromType<UsersTable>()`. Its marker calls need the devtools build
// transform, which is why this tree gets its own vitest config.
const TYPES = '/drizzle-e2e/types';
const OUT = '/out'; // report + logs, written back to the host
// The type-road pass, on unless the caller turns it off (`--skip-types`): it
// doubles the suite runs, which is worth skipping while iterating on the
// builders half alone.
const TYPE_PASS = (process.env.RT_DRIZZLE_TYPE_PASS ?? '1') !== '0';

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
  // The type road's `tableFromType<T>()` is a MARKER call: nothing resolves it
  // without the build transform, so the lane installs the devtools plugin and
  // the core runtime it forwards the injected id to. This is the first lane
  // that puts that whole chain in front of a real database.
  `@ts-runtypes/devtools@${VERSION}`,
  `@ts-runtypes/core@${VERSION}`,
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

// ── 5. the second translation: onto the pure-type road ──────────────────────
// AFTER the runner and the addendum, so the addendum's builders convert too:
// it covers the builders drizzle's suites never touch, which is exactly where
// the type road would otherwise have no coverage at all.
if (TYPE_PASS) step('converting the translated tree onto the type road');
let convertReport = {files: [], refusals: []};
let convertedCount = 0;
if (TYPE_PASS) {
rmSync(TYPES, {recursive: true, force: true});
cpSync(WORK, TYPES, {recursive: true});
cpSync(path.join(SRC, 'vitest.types.config.ts'), path.join(TYPES, 'vitest.config.ts'));
const convertReportFile = path.join(OUT, `${DIALECT}-convert-report.json`);
const convert = spawnSync(
  binary,
  ['convert', '--tsconfig', path.join(TYPES, 'tsconfig.json'), '--to', 'type', '--report', convertReportFile, path.join(TYPES, 'tests')],
  {cwd: HOME, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024}
);
process.stdout.write(convert.stdout ?? '');
process.stderr.write(convert.stderr ?? '');
if (convert.error) throw convert.error;
if (!existsSync(convertReportFile)) throw new Error('run-suite: the converter wrote no report');
convertReport = JSON.parse(readFileSync(convertReportFile, 'utf8'));
convertedCount = (convertReport.files ?? []).reduce((total, file) => total + (file.converted?.length ?? 0), 0);
// A refusal costs COVERAGE, never correctness: the refused declaration stays
// valid builders code and its test still runs. The coverage gate below is what
// decides whether the refusals cost us anything.
console.log(`-> converted ${convertedCount} table(s) with ${(convertReport.refusals ?? []).length} refusal(s)`);
}

// ── 6. the database, then the tests ─────────────────────────────────────────
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
// The control gets its OWN database. Sharing one would make the comparison
// depend on which run went first: drizzle's suites drop and recreate their
// tables, so whichever ran second would inherit the other's leftovers and the
// two outcomes would no longer be independent measurements of the same thing.
step('running the untranslated control');
useControlDatabase();
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
const suiteFailed = assertSameOutcomesAsControl(resultsFile, controlResults, 'translated');

// The type road, against its own database and the SAME control. Its vitest
// config loads the devtools plugin, so this run also exercises the marker →
// resolver → tableFromType chain a consumer's build performs.
const typesResults = path.join(OUT, `${DIALECT}-types-results.json`);
let typesSuiteFailed = false;
if (TYPE_PASS) {
  step('running the type-road suite');
  useTypesDatabase();
  spawnSync(
    'npx',
    ['vitest', 'run', '--root', TYPES, '--config', path.join(TYPES, 'vitest.config.ts'), '--reporter=default', '--reporter=json', '--outputFile', typesResults],
    {cwd: HOME, stdio: 'inherit', env: {...process.env, NODE_OPTIONS: '--max-old-space-size=4096'}}
  );
  typesSuiteFailed = assertSameOutcomesAsControl(typesResults, controlResults, 'type road');
}

step('typechecking both roads against the untranslated control');
const controlTypeErrors = runTsc(CONTROL);
writeFileSync(path.join(OUT, `${DIALECT}-control-typecheck.log`), `${controlTypeErrors.join('\n')}\n`);
const typecheckFailed = typecheckAgainstControl(WORK, controlTypeErrors, 'translated', `${DIALECT}-typecheck.log`);
const typesTypecheckFailed = TYPE_PASS && typecheckAgainstControl(TYPES, controlTypeErrors, 'type road', `${DIALECT}-types-typecheck.log`);

// ── 7. coverage ─────────────────────────────────────────────────────────────
step('checking manifest coverage');
const coverageFailed = checkCoverage(report, suiteDir, resultsFile);
const typesCoverageFailed = TYPE_PASS && checkTypeRoadCoverage(path.join(TYPES, 'tests', spec.suite, spec.common), typesResults, convertReport);

const failures = {suiteFailed, typesSuiteFailed, typecheckFailed, typesTypecheckFailed, coverageFailed, typesCoverageFailed};
writeFileSync(
  path.join(OUT, `${DIALECT}-summary.json`),
  `${JSON.stringify({dialect: DIALECT, ...failures, converted: convertedCount, refusals: report.refusals ?? [], convertRefusals: convertReport.refusals ?? []}, null, 2)}\n`
);
if (Object.values(failures).some(Boolean)) {
  console.error(`\n==> [${DIALECT}] FAILED — ${Object.entries(failures).filter(([, failed]) => failed).map(([name]) => name).join(', ')}`);
  process.exit(1);
}
console.log(`\n==> [${DIALECT}] ${TYPE_PASS ? 'both roads are' : 'the translated suite is'} green against a real database`);

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
function assertSameOutcomesAsControl(resultsFile, controlResults, label) {
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
    if (before.get(name) !== status) differ.push(`${name}: drizzle ${before.get(name)}, ${label} ${status}`);
  }
  for (const name of before.keys()) if (!after.has(name)) differ.push(`${name}: present on drizzle's code, MISSING on the ${label}`);
  const tally = (map) => {
    const counts = {};
    for (const status of map.values()) counts[status] = (counts[status] ?? 0) + 1;
    return Object.entries(counts).map(([status, n]) => `${n} ${status}`).join(', ');
  };
  console.log(`-> drizzle's own code: ${tally(before)}`);
  console.log(`-> ${label}: ${tally(after)} (includes this lane's addendum)`);
  if (ownFailures.length > 0) console.error(`run-suite: the addendum failed on the ${label}:\n  ${ownFailures.join('\n  ')}`);
  if (differ.length > 0) {
    console.error(`run-suite: ${differ.length} test(s) whose outcome the ${label} CHANGED:\n  ${differ.join('\n  ')}`);
  }
  if (differ.length === 0 && ownFailures.length === 0) {
    console.log(`-> every vendored test has the same outcome on drizzle's code and on the ${label}`);
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
    rmSync('/tmp/drizzle-e2e-control.sqlite', {force: true});
    rmSync('/tmp/drizzle-e2e-types.sqlite', {force: true});
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

// Point the environment at the control's own database, created empty here so the
// untranslated run starts from exactly the state the translated one did.
function useControlDatabase() {
  if (DIALECT === 'sqlite') {
    process.env.SQLITE_DB_PATH = '/tmp/drizzle-e2e-control.sqlite';
    return;
  }
  if (DIALECT === 'pg') {
    spawnSync('psql', ['-h', '127.0.0.1', '-U', 'postgres', '-c', 'drop database if exists control'], {stdio: 'ignore', env: {...process.env, PGPASSWORD: 'postgres'}});
    spawnSync('psql', ['-h', '127.0.0.1', '-U', 'postgres', '-c', 'create database control'], {stdio: 'ignore', env: {...process.env, PGPASSWORD: 'postgres'}});
    process.env.PG_CONNECTION_STRING = 'postgres://postgres:postgres@127.0.0.1:5432/control';
    return;
  }
  spawnSync('mysql', ['-h', '127.0.0.1', '-uroot', '-pdrizzle', '-e', 'drop database if exists control; create database control'], {stdio: 'ignore'});
  process.env.MYSQL_CONNECTION_STRING = 'mysql://root:drizzle@127.0.0.1:3306/control';
}

// The type road's own database, for the same reason the control has one: the
// suites drop and recreate the same tables, so a shared database would make
// whichever ran second depend on the other.
function useTypesDatabase() {
  if (DIALECT === 'sqlite') {
    rmSync('/tmp/drizzle-e2e-types.sqlite', {force: true});
    process.env.SQLITE_DB_PATH = '/tmp/drizzle-e2e-types.sqlite';
    return;
  }
  if (DIALECT === 'pg') {
    const psql = (statement) =>
      spawnSync('psql', ['-h', '127.0.0.1', '-U', 'postgres', '-c', statement], {stdio: 'ignore', env: {...process.env, PGPASSWORD: 'postgres'}});
    psql('drop database if exists types');
    psql('create database types');
    process.env.PG_CONNECTION_STRING = 'postgres://postgres:postgres@127.0.0.1:5432/types';
    return;
  }
  spawnSync('mysql', ['-h', '127.0.0.1', '-uroot', '-pdrizzle', '-e', 'drop database if exists types; create database types'], {stdio: 'ignore'});
  process.env.MYSQL_CONNECTION_STRING = 'mysql://root:drizzle@127.0.0.1:3306/types';
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
// And the bar is the same one the suite run uses — the translated tree must
// typecheck exactly as the untranslated CONTROL does, so nothing has to judge
// which of drizzle's own errors are excusable.
function typecheckAgainstControl(tree, control, label, logName) {
  const translated = runTsc(tree);
  writeFileSync(path.join(OUT, logName), `${translated.join('\n')}\n`);
  const {added, removed} = diffTypeErrors({translated, control, roots: [`${tree}/`, `${CONTROL}/`]});
  console.log(`-> type errors on the ${label}: ${control.length} before, ${translated.length} after`);
  if (added.length === 0 && removed.length === 0) return false;
  if (added.length > 0) {
    console.error(`run-suite: the ${label} ADDED ${added.length} type error(s) the untranslated tree does not have:`);
    console.error(added.slice(0, 40).join('\n'));
  }
  if (removed.length > 0) {
    console.error(`run-suite: the ${label} REMOVED ${removed.length} type error(s), so the two trees are no longer the same program:`);
    console.error(removed.slice(0, 40).join('\n'));
  }
  return true;
}

function runTsc(dir) {
  const result = spawnSync('npx', ['tsc', '--noEmit', '-p', path.join(dir, 'tsconfig.json')], {cwd: HOME, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
  return errorLines(`${result.stdout ?? ''}${result.stderr ?? ''}`);
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

// The type road's coverage gate, the same bar as the builders one keyed on the
// manifests' OTHER generated field: every migrated entry that has a `typeAlias`
// must appear in the converted tree, inside a test that actually passed.
//
// What excuses a miss is a REFUSAL, and only one the converter reported: the
// reasons come out of its own report, so a refusal class that quietly grows
// cannot pass as coverage. A builder whose every use sits inside a refused
// table is exactly the case this catches.
function checkTypeRoadCoverage(suiteFile, resultsFile, convertReport) {
  const suite = readFileSync(suiteFile, 'utf8');
  const manifests = JSON.parse(readFileSync(path.join(OUT, 'manifests.json'), 'utf8'));
  const notPassed = notPassedTestSpans(suite, resultsFile);
  // The CONVERTED addendum, not the source one: the source is written in
  // builders form, so scanning it for a type alias would never match.
  const addendum = readFileSync(path.join(TYPES, 'tests', spec.suite, `mion-${DIALECT}-addendum.test.ts`), 'utf8');
  const refusedReasons = new Map();
  for (const refusal of convertReport.refusals ?? []) refusedReasons.set(refusal.decl, refusal.message);
  const missing = [];
  for (const manifest of spec.manifests) {
    for (const entry of (manifests[manifest] ?? []).filter((one) => one.status === 'migrated' && one.typeAlias)) {
      // A type alias is spelled `Varchar<…>` or bare (`DB.Varchar`), so require
      // the name followed by `<`, `;` or `&` — never a bare word, which would
      // count an import or a comment.
      const spelled = new RegExp(`\\b${entry.typeAlias}\\s*[<;&]`);
      if (usedOutsideSpans(suite, entry.typeAlias, notPassed, spelled) || spelled.test(addendum)) continue;
      missing.push(`${manifest}.${entry.fn} (${entry.typeAlias})`);
    }
  }
  if (missing.length === 0) {
    console.log(`-> every migrated manifest entry with a type alias was exercised on the type road (${refusedReasons.size} declaration(s) refused, each with a reason)`);
    return false;
  }
  console.error(
    `run-suite: ${missing.length} migrated manifest entr(ies) never reached the type road in a test that actually RAN.\n` +
      `Either the conversion refused every table that uses them (the report says why), or every use sits inside a failing test. ` +
      `Add them to container/drizzle-e2e/shared/addendum/${DIALECT}.test.ts, or fix the refusal:\n  ${missing.join('\n  ')}`
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

// At least one USE of this binding must sit outside every span above. The
// default pattern is a CALL; the type road passes its own (a type is written,
// never called).
function usedOutsideSpans(suite, local, spans, pattern) {
  const call = new RegExp(pattern ? pattern.source : `\\b${local}\\s*[(<\`]`, 'g');
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
