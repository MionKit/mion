// typecheck-coverage.mjs — the gate the root typecheck runs first: every package under packages/
// declares a `typecheck:test` script (or names itself in EXEMPT with a reason), and every file it
// ships sits inside one of the projects its scripts name. `pnpm -r` skips a package with no such
// script WITHOUT saying so, and a script existing is not the same as it covering the code: twelve
// packages had none, bin-uws had one that left its shipped lib/index.js in no project, and a call
// with no import shipped in platform-uws/src/uwsHttp.ts with typecheck and lint both green.
// Projects expand through TypeScript's own config parser, not 25 `tsc --showConfig` spawns
// (~100 ms against ~17 s), so this needs the installed typescript and cannot be one of the
// install-free tree sweeps in scripts/ci/check-tree.mjs.
// Usage: `pnpm miondevx core typecheck-coverage` lists each package and its projects, --check gates only.
import {readdirSync, readFileSync, existsSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import ts from 'typescript';
import {REPO_ROOT} from '../lib/env.mjs';
import {capture, die, green, red, reportCliError} from '../lib/proc.mjs';

const SCRIPT = 'typecheck:test';

// Shipped code only, because two test trees sit outside their package's project on purpose
// (run-types/test/playground, devtools/test-fixtures).
const SOURCE_DIRS = ['src', 'lib', 'bin'];

// Each entry needs its reason. Empty today and meant to stay so: a package with nothing to check has no source.
export const EXEMPT = {};

// Shipped files a project leaves out on purpose, each with the reason.
export const NOT_CHECKED = {
  'examples/src/run-types/comparison-typia.ts': 'compares against typia, which the workspace does not install',
};

// Takes the root so the contract test can drive it against the real tree or a fixture.
export function readPackages(repoRoot = REPO_ROOT) {
  const packagesDir = join(repoRoot, 'packages');
  return readdirSync(packagesDir)
    .map((dir) => ({dir, file: join(packagesDir, dir, 'package.json')}))
    .filter(({file}) => existsSync(file))
    .map(({dir, file}) => ({dir, scripts: JSON.parse(readFileSync(file, 'utf8')).scripts ?? {}}));
}

export function coverageDrift(packages, exempt = EXEMPT) {
  return {
    // A package pnpm would skip in silence.
    unchecked: packages.filter(({dir, scripts}) => !scripts[SCRIPT] && !(dir in exempt)).map(({dir}) => dir),
    staleExempt: Object.keys(exempt).filter((dir) => {
      const found = packages.find((entry) => entry.dir === dir);
      return !found || Boolean(found.scripts[SCRIPT]);
    }),
  };
}

// A package may need several projects (examples splits src/ across three module resolutions), so the union counts.
export function projectsOf(dir, ownScripts, rootScripts) {
  const configs = new Set();
  for (const script of Object.values(ownScripts)) {
    for (const [, config] of script.matchAll(/-p\s+(\S*tsconfig\S*\.json)/g)) configs.add(config);
  }
  const named = new RegExp(`-p\\s+packages/${dir}/(\\S*tsconfig\\S*\\.json)`, 'g');
  for (const script of Object.values(rootScripts)) {
    for (const [, config] of script.matchAll(named)) configs.add(config);
  }
  return [...configs];
}

function projectFiles(configPath) {
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error) return {error: ts.flattenDiagnosticMessageText(read.error.messageText, ' ')};
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, dirname(configPath));
  const fatal = parsed.errors.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  if (fatal.length > 0) return {error: ts.flattenDiagnosticMessageText(fatal[0].messageText, ' ')};
  return {files: parsed.fileNames.map((file) => resolve(file))};
}

// By git rather than a glob, so ignored build output never counts.
function shippedFiles(packageDir) {
  const listed = capture('git', ['ls-files', '-z', '--', ...SOURCE_DIRS], {cwd: packageDir});
  if (listed.status !== 0) die(`typecheck-coverage: git ls-files failed in ${packageDir}: ${listed.stderr.trim()}`);
  return listed.stdout
    .split('\0')
    .filter((file) => /\.(ts|js|mts|cts)$/.test(file) && !/\.config\.(ts|js|mts)$/.test(file));
}

// Reads the tree; the two rules it applies are pure, so the contract test drives those directly.
export function reachReport(repoRoot = REPO_ROOT, exempt = EXEMPT, notChecked = NOT_CHECKED) {
  const rootScripts = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).scripts ?? {};
  const report = [];
  for (const {dir, scripts} of readPackages(repoRoot)) {
    if (dir in exempt) continue;
    const packageDir = join(repoRoot, 'packages', dir);
    const projects = projectsOf(dir, scripts, rootScripts);
    const reached = new Set();
    const broken = [];
    for (const config of projects) {
      const expanded = projectFiles(join(packageDir, config));
      if (expanded.error) broken.push(`${config}: ${expanded.error}`);
      else for (const file of expanded.files) reached.add(file);
    }
    const shipped = shippedFiles(packageDir);
    report.push({
      dir,
      projects,
      broken,
      shipped: shipped.length,
      missed: shipped
        .filter((file) => !(`${dir}/${file}` in notChecked))
        .filter((file) => !reached.has(join(packageDir, file))),
    });
  }
  return report;
}

// An omission that no longer names a shipped file is an omission nobody will notice removing.
export function staleOmissions(repoRoot = REPO_ROOT, notChecked = NOT_CHECKED) {
  return Object.keys(notChecked).filter((file) => !existsSync(join(repoRoot, 'packages', file)));
}

export function checkCoverage(repoRoot = REPO_ROOT) {
  const packages = readPackages(repoRoot);
  const drift = coverageDrift(packages);
  const report = reachReport(repoRoot);
  const stale = staleOmissions(repoRoot);
  const missed = report.filter((entry) => entry.missed.length > 0);
  const broken = report.filter((entry) => entry.broken.length > 0);
  const noProject = report.filter((entry) => entry.projects.length === 0);
  // A sweep that quietly matched nothing would pass forever; the floor catches a bad pathspec.
  const swept = report.reduce((total, entry) => total + entry.shipped, 0);
  if (swept < 500) die(`typecheck-coverage: the sweep listed only ${swept} shipped files, so its pathspecs stopped matching`);

  if (
    drift.unchecked.length === 0 &&
    drift.staleExempt.length === 0 &&
    missed.length === 0 &&
    broken.length === 0 &&
    noProject.length === 0 &&
    stale.length === 0
  ) {
    const exemptCount = Object.keys(EXEMPT).length;
    const tail = exemptCount > 0 ? `, ${exemptCount} exempt with a reason` : '';
    console.log(`${green('ok')} all ${packages.length - exemptCount} packages run \`${SCRIPT}\` over all ${swept} files they ship${tail}.`);
    return true;
  }

  console.error(`${red('gap')} \`pnpm run typecheck\` does not cover all of packages/:`);
  if (drift.unchecked.length > 0) console.error(`   no \`${SCRIPT}\` script (add one):        ${drift.unchecked.join(' ')}`);
  if (drift.staleExempt.length > 0) console.error(`   exempt but checked, or gone (drop it): ${drift.staleExempt.join(' ')}`);
  if (noProject.length > 0) console.error(`   no script names a tsconfig:            ${noProject.map((entry) => entry.dir).join(' ')}`);
  for (const entry of broken) for (const problem of entry.broken) console.error(`   ${entry.dir} cannot be read — ${problem}`);
  for (const entry of missed) {
    console.error(`   ${entry.dir} ships ${entry.missed.length} file(s) no project reaches:`);
    for (const file of entry.missed) console.error(`      ${file}`);
  }
  if (stale.length > 0) console.error(`   listed as unchecked but gone (drop it): ${stale.join(' ')}`);
  console.error(`   fix: give the package a \`${SCRIPT}\` script, widen the tsconfig it names, or record the reason in scripts/core/typecheck-coverage.mjs.`);
  return false;
}

export function main(argv = []) {
  if (!checkCoverage()) die('', 1);
  if (argv.includes('--check')) return;
  const rootScripts = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')).scripts ?? {};
  for (const {dir, scripts} of readPackages()) {
    const projects = dir in EXEMPT ? [`exempt — ${EXEMPT[dir]}`] : projectsOf(dir, scripts, rootScripts);
    console.log(`${dir.padEnd(26)} ${projects.join(' ')}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    reportCliError(err);
  }
}
