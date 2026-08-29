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
const WORK = '/work';
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
run('npm', [
  'install',
  '--no-save',
  '--registry',
  REGISTRY,
  `@ts-runtypes/bin@${VERSION}`,
  `@mionjs/drizzle-orm@${process.env.RT_DRIZZLE_PKG_VERSION ?? VERSION}`,
  `@mionjs/drizzle-orm-${DIALECT}-core@${process.env.RT_DRIZZLE_PKG_VERSION ?? VERSION}`,
]);
const binary = path.join(HOME, 'node_modules', '.bin', 'ts-runtypes');
if (!existsSync(binary)) throw new Error(`run-suite: ${binary} is missing after the install — @ts-runtypes/bin did not resolve its platform binary`);

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
cpSync(path.join(SRC, 'tsconfig.json'), path.join(WORK, 'tsconfig.json'));
cpSync(path.join(SRC, 'vitest.config.ts'), path.join(WORK, 'vitest.config.ts'));

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
cpSync(path.join(SRC, 'skip-list.json'), path.join(suiteDir, 'skip-list.json'));

// ── 5. the database, then the tests ─────────────────────────────────────────
step('starting the database');
startDatabase();

step('running the translated suite');
const vitest = spawnSync('npx', ['vitest', 'run', '--root', WORK, '--config', path.join(WORK, 'vitest.config.ts')], {
  cwd: HOME,
  stdio: 'inherit',
  env: {...process.env, NODE_OPTIONS: '--max-old-space-size=4096'},
});
const suiteFailed = vitest.status !== 0;

step('typechecking the translated tree');
const typecheckFailed = typecheck();

// ── 6. coverage ─────────────────────────────────────────────────────────────
step('checking manifest coverage');
const coverageFailed = checkCoverage(report);

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
function checkCoverage(report) {
  const missing = [];
  const addendum = readFileSync(path.join(SRC, 'addendum', `${DIALECT}.test.ts`), 'utf8');
  const manifests = JSON.parse(readFileSync(path.join(OUT, 'manifests.json'), 'utf8'));
  for (const manifest of spec.manifests) {
    const entries = (manifests[manifest] ?? []).filter((entry) => entry.status === 'migrated');
    const used = new Set(report.used?.[manifest] ?? []);
    for (const entry of entries) {
      if (used.has(entry.fn)) continue;
      // A bare name match would count a comment; require a call.
      if (new RegExp(`\\b${entry.fn}\\s*\\(`).test(addendum)) continue;
      missing.push(`${manifest}.${entry.fn}`);
    }
  }
  if (missing.length === 0) {
    console.log('-> every migrated manifest entry was exercised');
    return false;
  }
  console.error(
    `run-suite: ${missing.length} migrated manifest entr(ies) were never exercised by the translated suite.\n` +
      `Add them to container/drizzle-e2e/shared/addendum/${DIALECT}.test.ts so they hit a real database:\n  ${missing.join('\n  ')}`
  );
  return true;
}
