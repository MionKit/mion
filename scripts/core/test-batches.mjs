// test-batches.mjs — `pnpm run test:ci`: the whole vitest suite, run in batches,
// plus the drift gate that keeps those batches covering every project.
//
// Why batches at all: a resolver process is ~200 MB, so one `vitest run` over all
// 21 projects OOMs on a small host. Splitting the run into groups that each start
// and tear down on their own keeps the peak down.
//
// Why a gate: the batch list used to be hand-written into package.json with no tie
// to vitest.config.ts, and it drifted — it named the 16 mion projects and NONE of
// the 5 runtypes ones, so `test:ci` came back green having skipped 309 of the 397
// test files, including every test that drives the Go resolver through the plugin.
// Now vitest.config.ts's `test.projects` list is the single source of truth: BATCHES
// only GROUPS those names, and any project missing from (or unknown to) the grouping
// fails `--check` in CI and fails the run itself before a single test boots.
//
// Usage (via `pnpm miondevx core test-batches …`, or `node scripts/core/test-batches.mjs …`):
//   test-batches                run every batch in order (extra args pass to vitest)
//   test-batches --check        drift only: batches must cover the config exactly
//   test-batches --list         print the batches and their projects
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {REPO_ROOT} from '../lib/env.mjs';
import {die, green, red, note, reportCliError, runOrThrow} from '../lib/proc.mjs';

const ROOT_CONFIG = 'vitest.config.ts';

// The batches, in run order. Grouping ONLY — every name here must exist in
// vitest.config.ts and each project must appear exactly once, which is what
// `--check` enforces.
//
// The runtypes side runs first and gets three batches of its own: `runtypes` (220
// test files) and `devtools-core` (87, and it spawns the binary) are the two
// heaviest projects in the repo, which is the whole reason batching exists. The
// three small runtypes projects share the third. The four mion batches below are
// the original grouping, unchanged.
//
// `devtools-core` and `devtools` are two vitest projects in ONE package
// (packages/devtools) since the two devtools packages merged: the `devtools`
// project installs mionVitePlugin over its own sources, and running the core
// suite through that transform would change what it exercises. They stay in
// different batches for the same reason they always were, weight.
export const BATCHES = [
  {name: 'runtypes', projects: ['runtypes']},
  {name: 'runtypes-devtools', projects: ['devtools-core']},
  {name: 'runtypes-satellites', projects: ['playground', '@mionjs/go-be-sidecar', 'mock-format-isolation']},
  {name: 'mion-core', projects: ['core', 'router']},
  {
    name: 'mion-drizzle',
    projects: ['drizzle-root', 'drizzle-pg', 'drizzle-mysql', 'drizzle-sqlite', 'devtools', 'platform-aws', 'platform-gcloud'],
  },
  {name: 'mion-platforms', projects: ['platform-node', 'platform-vercel', 'platform-cloudflare', 'platform-uws', 'uws']},
  {name: 'mion-rest', projects: ['client', 'type-budget']},
];

// The project config paths listed under `test.projects` in the root vitest config.
// Pure (takes the file text) so the contract test can drive it with a fixture.
export function projectConfigPaths(text) {
  const projects = /projects:\s*\[([\s\S]*?)\n\s*\]/.exec(text);
  if (!projects) die('core test-batches: no `test.projects` array found in vitest.config.ts');
  // Any *.config.ts inside the projects array, not just files literally named
  // `vitest.config.ts`: packages/devtools declares two projects and its second
  // config is `vitest.core.config.ts`. The old pattern silently skipped it, which
  // read as "the batches name a project the config does not declare" rather than
  // "the parser cannot see it".
  return [...projects[1].matchAll(/'([^']*\.config\.ts)'/g)].map((match) => match[1]);
}

// The `name` a project config declares. Pure, same reason.
export function projectName(text) {
  const name = /name:\s*'([^']+)'/.exec(text) ?? /name:\s*"([^"]+)"/.exec(text);
  return name ? name[1] : undefined;
}

// Every project name the root config pulls in, in declaration order.
export function readProjectNames(repoRoot = REPO_ROOT) {
  const paths = projectConfigPaths(readFileSync(join(repoRoot, ROOT_CONFIG), 'utf8'));
  return paths.map((path) => {
    const name = projectName(readFileSync(join(repoRoot, path), 'utf8'));
    if (!name) die(`core test-batches: ${path} declares no vitest project \`name\` — batches address projects by name`);
    return name;
  });
}

// The config-to-batches contract, as three disjoint drift lists. Pure (takes the
// project names) so the test can drive it without touching the real config.
export function batchDrift(projectNames, batches = BATCHES) {
  const batched = batches.flatMap((batch) => batch.projects);
  const known = new Set(projectNames);
  const seen = new Map();
  for (const project of batched) seen.set(project, (seen.get(project) ?? 0) + 1);
  return {
    // A project vitest.config.ts runs that no batch names — `test:ci` would skip it.
    missing: projectNames.filter((project) => !seen.has(project)),
    // A batch naming a project the config does not define — vitest matches nothing.
    unknown: batched.filter((project) => !known.has(project)).filter((project, i, all) => all.indexOf(project) === i),
    // A project named by two batches — its tests would run twice.
    duplicate: [...seen].filter(([, count]) => count > 1).map(([project]) => project),
  };
}

// Report the drift check; returns true when the contract holds.
export function checkBatches(repoRoot = REPO_ROOT) {
  const projectNames = readProjectNames(repoRoot);
  const drift = batchDrift(projectNames);
  const clean = drift.missing.length === 0 && drift.unknown.length === 0 && drift.duplicate.length === 0;
  if (clean) {
    console.log(`${green('ok')} the test:ci batches cover all ${projectNames.length} vitest projects, each exactly once.`);
    return true;
  }
  console.error(`${red('drift')} the BATCHES in scripts/core/test-batches.mjs do not match vitest.config.ts:`);
  if (drift.missing.length > 0) console.error(`   in the config, in no batch (add them):      ${drift.missing.join(' ')}`);
  if (drift.unknown.length > 0) console.error(`   batched but not a project (remove them):    ${drift.unknown.join(' ')}`);
  if (drift.duplicate.length > 0) console.error(`   named by two batches (keep one):            ${drift.duplicate.join(' ')}`);
  console.error('   fix: every project in vitest.config.ts belongs to exactly one batch in scripts/core/test-batches.mjs.');
  return false;
}

export function main(argv = []) {
  if (argv.includes('--list')) {
    for (const batch of BATCHES) console.log(`${batch.name.padEnd(20)} ${batch.projects.join(' ')}`);
    return;
  }
  // The gate runs before the suite too: a drifted batch list means the run about to
  // start would skip projects, and a green skip is worse than a red failure.
  if (!checkBatches()) die('', 1);
  if (argv.includes('--check')) return;
  const passThrough = argv.filter((arg) => arg !== '--check' && arg !== '--list');
  for (const batch of BATCHES) {
    note(`test:ci batch ${batch.name} — ${batch.projects.join(' ')}`);
    const projectFlags = batch.projects.flatMap((project) => ['--project', project]);
    runOrThrow('pnpm', ['exec', 'vitest', 'run', ...projectFlags, ...passThrough], {
      failMessage: `core test-batches: batch '${batch.name}' failed`,
    });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    reportCliError(err);
  }
}
