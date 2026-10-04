// Lints `@mion-downgrade-error` / `@mion-expect-error` comments in packages/: the main oxlint config ignores
// test/ and examples/, where nearly all live, and a whole-tree pass takes minutes.
import {join} from 'node:path';
import {REPO_ROOT} from '../lib/env.mjs';
import {capture, die, green, reportCliError} from '../lib/proc.mjs';

const DIRECTIVE = '@mion-(downgrade|expect)-error';
const CONFIG = join(REPO_ROOT, 'scripts/core/oxlint-directives.json');

// Tracked files only: build output and node_modules never count.
export function directiveFiles(repoRoot = REPO_ROOT) {
  const listed = capture('git', ['grep', '-l', '-z', '-E', DIRECTIVE, '--', 'packages/*.ts'], {cwd: repoRoot});
  // git grep exits 1 when nothing matches.
  if (listed.status === 1) return [];
  if (listed.status !== 0) die(`lint-directives: git grep failed: ${listed.stderr.trim()}`);
  return listed.stdout.split('\0').filter(Boolean);
}

// Only the directive codes (comment-*) and an engine failure (`[mion] ...`) fail; other findings are the tests' fixtures.
const FAILING = /^\[(?:comment-[a-z-]+\]|mion\])/;

export function failingDiagnostics(stdout) {
  return JSON.parse(stdout).diagnostics.filter((diagnostic) => FAILING.test(diagnostic.message));
}

export function main() {
  const files = directiveFiles();
  if (files.length === 0) die('lint-directives: no file carries a directive comment, so the pathspec stopped matching');
  const result = capture('pnpm', ['exec', 'oxlint', '-c', CONFIG, '-f', 'json', ...files], {cwd: REPO_ROOT});
  if (!result.stdout.trim().startsWith('{')) die(`lint-directives: oxlint failed:\n${result.stderr || result.stdout}`);
  const failing = failingDiagnostics(result.stdout);
  for (const diagnostic of failing) {
    const line = diagnostic.labels?.[0]?.span?.line ?? 1;
    console.error(`${diagnostic.filename}:${line}: ${diagnostic.message}`);
  }
  if (failing.length > 0) die(`lint-directives: ${failing.length} directive comment(s) need fixing`);
  console.log(`${green('ok')} every directive comment in ${files.length} files still matches a diagnostic.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (err) {
    reportCliError(err);
  }
}
