// check-tree.mjs — the repo hygiene sweeps that read EVERY tracked file. They run from the
// always-on `lanes` job (git plus node, no install, no build), never from a gated vitest lane:
// lanes skip by content (scripts/ci/lanes.mjs) and exclude the docs/, .claude/ and root prose
// paths a sweep reads. repo-contracts.test.ts unit-tests the rules by importing these functions.
// Usage: `pnpm run check:tree`, or `node scripts/ci/check-tree.mjs`.
import {closeSync, openSync, readFileSync, readSync} from 'node:fs';
import {join} from 'node:path';
import {REPO_ROOT} from '../lib/env.mjs';
import {capture, die, note, reportCliError, success} from '../lib/proc.mjs';

// A path under docs/todos/ or docs/done/ ending in a spec filename. Specs get
// deleted, so any reference to one rots; the rule is that nothing names them.
export const SPEC_REFERENCE = /docs\/(todos|done)\/[a-z0-9-]+\.md/;
// Where naming a spec is legitimate: the two spec directories themselves, the
// changelog (history), the vendored submodule and every isolated dependency tree.
export const SPEC_REFERENCE_EXEMPT = /^(docs\/(todos|done)\/|CHANGELOG\.md$|ts-go-runtypes\/third_party\/)|(^|\/)(_deps|node_modules)\//;

// Pure over (path, text) so the rule is testable without a checkout.
export const specReferenceOffenders = (entries) =>
  entries
    .filter(({file}) => !SPEC_REFERENCE_EXEMPT.test(file))
    .filter(({text}) => SPEC_REFERENCE.test(text))
    .map(({file}) => file);

// -I skips binaries, and git grep only sees tracked files, so ignored build output
// never trips any of this.
const grepFiles = (args) =>
  capture('git', ['grep', '-I', '-l', ...args], {cwd: REPO_ROOT})
    .stdout.trim()
    .split('\n')
    .filter(Boolean);

export function specReferences() {
  const candidates = grepFiles(['-E', SPEC_REFERENCE.source, '--', '.']);
  return specReferenceOffenders(candidates.map((file) => ({file, text: readFileSync(join(REPO_ROOT, file), 'utf8')})));
}

// The packages moved out of a separate repository and the old URL kept surviving in
// package.json fields and READMEs. docs/ is exempt: it records history. The needle is
// split so this file never matches itself.
export function oldRepoReferences() {
  return grepFiles([['MionKit', 'ts-run-types'].join('/'), '--', '.', ':!docs', ':!ts-go-runtypes/third_party']);
}

// A literal NUL makes git classify a file as BINARY: no line diffs, no auto-merge.
// Two files carried one, and the rtUtils.ts one blocked a rebase.
const NUL_SCANNED = ['*.ts', '*.tsx', '*.js', '*.mjs', '*.cjs', '*.go', '*.json', '*.md'];

export function nulBytes() {
  const listed = capture('git', ['ls-files', '-z', '--', ...NUL_SCANNED], {cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024});
  if (listed.status !== 0) die(`git ls-files failed: ${listed.stderr.trim()}`);
  const files = listed.stdout
    .split('\0')
    .filter(Boolean)
    .filter((file) => !file.startsWith('ts-go-runtypes/third_party/') && !file.includes('/testdata/'));
  // A sweep that silently matched nothing would pass forever; the floor catches it.
  if (files.length < 500) die(`the NUL sweep listed only ${files.length} files, so its pathspecs stopped matching`);
  return files.filter((file) => readFileSync(join(REPO_ROOT, file)).includes(0));
}

// A committed `go build` output (3.2 MB) once cost every clone until history was rewritten.
const EXECUTABLE_MAGIC = [
  [0x7f, 0x45, 0x4c, 0x46], // ELF
  [0xfe, 0xed, 0xfa, 0xce], // Mach-O 32-bit
  [0xfe, 0xed, 0xfa, 0xcf], // Mach-O 64-bit
  [0xce, 0xfa, 0xed, 0xfe], // Mach-O 32-bit, reversed byte order
  [0xcf, 0xfa, 0xed, 0xfe], // Mach-O 64-bit, reversed byte order
  [0xca, 0xfe, 0xba, 0xbe], // Mach-O universal
];

export function isCompiledExecutable(header, mode) {
  if (EXECUTABLE_MAGIC.some((magic) => magic.every((byte, i) => header[i] === byte))) return true;
  // `MZ` also opens ordinary text, so PE only counts with the executable bit.
  return mode === '100755' && header[0] === 0x4d && header[1] === 0x5a;
}

export function compiledExecutables() {
  const listed = capture('git', ['ls-files', '-z', '--stage'], {cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024});
  if (listed.status !== 0) die(`git ls-files failed: ${listed.stderr.trim()}`);
  const entries = listed.stdout
    .split('\0')
    .filter(Boolean)
    .map((line) => {
      const [meta, file] = line.split('\t');
      return {mode: meta.split(' ')[0], file};
    })
    // Symlinks and submodule pointers have no bytes of their own to read.
    .filter(({mode}) => mode !== '120000' && mode !== '160000')
    .filter(({file}) => !file.startsWith('ts-go-runtypes/third_party/') && !/(^|\/)(_deps|node_modules)\//.test(file));
  if (entries.length < 500) die(`the executable sweep listed only ${entries.length} files, so git ls-files stopped matching`);
  const header = Buffer.alloc(4);
  return entries
    .filter(({mode, file}) => {
      const fd = openSync(join(REPO_ROOT, file), 'r');
      try {
        return readSync(fd, header, 0, 4, 0) === 4 && isCompiledExecutable(header, mode);
      } finally {
        closeSync(fd);
      }
    })
    .map(({file}) => file);
}

// Miniflare names a modules worker `relative(modulesRoot, scriptPath)`, and modulesRoot defaults
// to process.cwd(). A scriptPath outside the cwd therefore becomes a `..` name, which workerd
// refuses with `can't use ".." to break out of starting directory`. CI runs vitest from the repo
// root, where the name is clean, so an unpaired scriptPath stays green there and dies under
// `pnpm --filter <pkg> test`. An explicit modulesRoot is what makes the worker boot from any dir.
const MINIFLARE_CALL = 'new Miniflare(';
const MINIFLARE_SCANNED = ['*.ts', '*.tsx', '*.mts', '*.cts', '*.js', '*.mjs', '*.cjs'];

// Pure over (path, text) so the rule is testable without a checkout.
export const miniflareCwdOffenders = (entries) =>
  entries.filter(({text}) => miniflareArguments(text).some((args) => args.includes('scriptPath:') && !args.includes('modulesRoot:'))).map(({file}) => file);

// The argument list of every `new Miniflare(...)`, paren-balanced and stripped of comments and
// string bodies: the bench call sites pass a whole worker as a template literal full of its own
// parens, and a commented-out or quoted `modulesRoot:` is not one that reaches miniflare.
function miniflareArguments(text) {
  const slices = [];
  for (let found = text.indexOf(MINIFLARE_CALL); found !== -1; found = text.indexOf(MINIFLARE_CALL, found + 1)) {
    let code = '';
    let at = found + MINIFLARE_CALL.length;
    let depth = 1;
    while (at < text.length && depth > 0) {
      const char = text[at];
      if (char === '/' && (text[at + 1] === '/' || text[at + 1] === '*')) at = skipComment(text, at);
      else if (char === '"' || char === "'" || char === '`') at = skipQuoted(text, at);
      else {
        if (char === '(') depth++;
        else if (char === ')') depth--;
        if (depth > 0) code += char;
        at++;
      }
    }
    slices.push(code);
  }
  return slices;
}

function skipComment(text, at) {
  if (text[at + 1] === '/') {
    const end = text.indexOf('\n', at);
    return end === -1 ? text.length : end + 1;
  }
  const end = text.indexOf('*/', at + 2);
  return end === -1 ? text.length : end + 2;
}

function skipQuoted(text, at) {
  const quote = text[at];
  for (let cursor = at + 1; cursor < text.length; cursor++) {
    if (text[cursor] === '\\') cursor++;
    else if (text[cursor] === quote) return cursor + 1;
  }
  return text.length;
}

export function miniflareCwdWorkers() {
  // Source only: a markdown fence quoting the broken shape is documentation, not a call site.
  const candidates = grepFiles(['-F', MINIFLARE_CALL, '--', ...MINIFLARE_SCANNED, ':!**/node_modules/**', ':!**/_deps/**']);
  // A sweep that matched nothing would pass forever; the repo always has miniflare call sites.
  if (candidates.length === 0) die(`no file constructs a Miniflare, so the ${MINIFLARE_CALL} needle stopped matching`);
  return miniflareCwdOffenders(candidates.map((file) => ({file, text: readFileSync(join(REPO_ROOT, file), 'utf8')})));
}

export const SWEEPS = [
  {name: 'no file outside docs/todos and docs/done names a spec', run: specReferences, fix: 'put the reasoning in the file that needs it; a spec gets deleted and the reference rots'},
  {name: 'no tracked file outside docs/ names the old repository', run: oldRepoReferences, fix: 'point it at MionKit/mion'},
  {name: 'no tracked source carries a literal NUL byte', run: nulBytes, fix: 'strip the NUL; git treats the file as binary and a rebase cannot merge it'},
  {name: 'no tracked file is a compiled executable', run: compiledExecutables, fix: 'git rm it and ignore the build output; a binary is rebuilt from source, never committed'},
  {name: 'no miniflare worker depends on the directory it was started from', run: miniflareCwdWorkers, fix: "pass modulesRoot beside scriptPath; without it miniflare names the module relative to process.cwd() and workerd refuses a `..` name"},
];

export function main() {
  const failed = [];
  for (const sweep of SWEEPS) {
    const offenders = sweep.run();
    if (offenders.length === 0) continue;
    failed.push(sweep.name);
    note(`${sweep.name} — ${offenders.length} offender(s), ${sweep.fix}:`);
    for (const file of offenders) console.error(`  ${file}`);
  }
  if (failed.length > 0) die(`check-tree: ${failed.length} sweep(s) failed`);
  success(`check-tree: all ${SWEEPS.length} whole-tree sweeps clean`);
}

if (import.meta.main) {
  try {
    main();
  } catch (err) {
    reportCliError(err);
  }
}
