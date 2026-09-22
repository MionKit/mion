// test-bun.mjs — `pnpm run test:bun`: platform-bun's bun:test suites, plus the gate that every test
// file contributed tests. Bun runs a package in ONE process, so a file that throws while its describe
// body is evaluated runs none of its tests and the summary still reads `0 fail`. Nothing else pins the
// count, so this does: the junit report must name every test file on disk, each with at least one test.
// Run it with `pnpm miondevx core test-bun …`; extra args pass straight to `bun test`.
import {readFileSync, mkdtempSync, rmSync, readdirSync} from 'node:fs';
import {join, relative, sep} from 'node:path';
import {tmpdir} from 'node:os';
import {REPO_ROOT} from '../lib/env.mjs';
import {die, red, note, run, success, reportCliError} from '../lib/proc.mjs';

const PACKAGE_DIR = join(REPO_ROOT, 'packages/platform-bun');
const SKIP_DIRS = new Set(['node_modules', '.dist', '.mion', '.mion-build', '.coverage']);
const TEST_FILE = /\.(test|spec)\.ts$/;

// Posix paths: that is how the junit report names the files.
function discoverTestFiles(dir = PACKAGE_DIR) {
  const found = [];
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) found.push(...discoverTestFiles(join(dir, entry.name)));
    } else if (TEST_FILE.test(entry.name)) {
      found.push(relative(PACKAGE_DIR, join(dir, entry.name)).split(sep).join('/'));
    }
  }
  return found;
}

// Nested <testsuite> elements repeat the same `file`, so the largest count is that file's total.
// A file bun never reported stays absent from the map, which is the case this exists to catch.
export function testsPerFile(xml) {
  const perFile = new Map();
  for (const [, attrs] of xml.matchAll(/<testsuite\b([^>]*)>/g)) {
    const file = /\bfile="([^"]*)"/.exec(attrs)?.[1];
    const tests = Number(/\btests="(\d+)"/.exec(attrs)?.[1] ?? 0);
    if (file) perFile.set(file, Math.max(perFile.get(file) ?? 0, tests));
  }
  return perFile;
}

export function swallowedFiles(expected, perFile) {
  return expected.filter((file) => !(perFile.get(file) > 0));
}

export function main(argv = []) {
  const expected = discoverTestFiles();
  if (!expected.length) die('core test-bun: no bun test files found under packages/platform-bun');

  const outDir = mkdtempSync(join(tmpdir(), 'mion-test-bun-'));
  const report = join(outDir, 'bun-junit.xml');
  try {
    const code = run('bun', ['--cwd', PACKAGE_DIR, 'test', ...argv, '--reporter=junit', `--reporter-outfile=${report}`]);

    let xml;
    try {
      xml = readFileSync(report, 'utf8');
    } catch {
      die(`core test-bun: bun wrote no junit report (exit ${code}) — the run died before collecting any file`, code || 1);
    }

    const swallowed = swallowedFiles(expected, testsPerFile(xml));
    if (swallowed.length) {
      note(red('A bun test file ran none of its tests. Bun shares one process across files, so a throw'));
      note(red('while a describe body is evaluated skips that whole file and the summary still reads green:'));
      for (const file of swallowed) note(red(`  ${file}`));
      die('core test-bun: the bun suite is incomplete', 1);
    }
    if (code !== 0) die('', code);
    success(`bun suite complete: ${expected.length} test file(s), all reporting tests`);
  } finally {
    rmSync(outDir, {recursive: true, force: true});
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    reportCliError(err);
  }
}
