// Fails CI on an error only the bundled tsgo reports, before a consumer's `mion compile` build hits it.
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {REPO_ROOT} from '../lib/env.mjs';
import {capture, die, green, red, reportCliError} from '../lib/proc.mjs';
import {EXEMPT, projectsOf, readPackages} from './typecheck-coverage.mjs';

const MION = join(REPO_ROOT, 'mion-bin', 'mion');

export const TSC_ONLY = {
  'run-types/tsconfig.cjs.json': 'the CommonJS emit needs node10 resolution, which tsgo removed (TS5108)',
};

export function tsErrors(output) {
  return output.split('\n').filter((line) => /error TS\d+:/.test(line));
}

// Examples raise RunType diagnostics on purpose, so a non-zero exit is a crash only when none is printed.
export function failureLines(status, output) {
  const errors = tsErrors(output);
  if (errors.length > 0) return errors;
  return status !== 0 && !/: error [a-z][a-z0-9]*(?:-[a-z0-9]+)+:/.test(output) ? [output] : [];
}

export function projects(repoRoot = REPO_ROOT) {
  const rootScripts = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).scripts ?? {};
  return readPackages(repoRoot)
    .filter(({dir}) => !(dir in EXEMPT))
    .flatMap(({dir, scripts}) => projectsOf(dir, scripts, rootScripts).map((config) => ({dir, config})))
    .filter(({dir, config}) => !(`${dir}/${config}` in TSC_ONLY));
}

export function main() {
  const genDir = mkdtempSync(join(tmpdir(), 'mion-tsgo-check-'));
  const failed = [];
  const list = projects();
  try {
    for (const {dir, config} of list) {
      const cwd = join(REPO_ROOT, 'packages', dir);
      const result = capture(MION, ['compile', '--cwd', cwd, '--tsconfig', config, '--gen-dir', genDir, '--no-emit', '--log-style', 'lines']);
      if (result.error) die(`tsgo-check: cannot run ${MION} (${result.error.message}); build it with \`pnpm run check:builds\``);
      const lines = failureLines(result.status, `${result.stdout}\n${result.stderr}`);
      if (lines.length > 0) failed.push({dir, config, lines});
    }
  } finally {
    rmSync(genDir, {recursive: true, force: true});
  }
  if (failed.length === 0) {
    console.log(`${green('ok')} mion compile (tsgo) reports no TypeScript error in ${list.length} projects.`);
    return;
  }
  console.error(`${red('fail')} mion compile (tsgo) reports TypeScript errors that \`pnpm run typecheck\` must not pass:`);
  for (const {dir, config, lines} of failed) {
    console.error(`   packages/${dir}/${config}`);
    for (const line of new Set(lines)) console.error(`      ${line.trim()}`);
  }
  die('', 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (err) {
    reportCliError(err);
  }
}
