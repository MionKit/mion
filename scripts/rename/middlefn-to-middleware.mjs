// One-off rename of middleFn to middleware across source, Go and docs. Kept only while the rename PR is open,
// so a rebase can re-run it on fresh main instead of hand-merging conflicts.
//
//   node scripts/rename/middlefn-to-middleware.mjs scan [outDir]   # candidates table + clash report
//   node scripts/rename/middlefn-to-middleware.mjs apply           # rewrite contents, git mv paths
//   node scripts/rename/middlefn-to-middleware.mjs check           # fail if any old name is left

import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SKIPS = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'rename-skips.json'), 'utf8'));
const EXCLUDE = SKIPS.excludePaths.map((src) => new RegExp(src));
const SKIP_NAMES = new Set(SKIPS.skipNames);
const OVERRIDES = SKIPS.overrides;

// a trailing s is plural only when no lowercase letter follows it: middleFnsById vs MiddleFnSuccess
const OLD = /middle([-_ ]?)(fn|function)(s(?![a-z]))?/gi;
// prose that already says "middleware function(s)" collapses to plain "middleware"
const PROSE_FN = /\b(middleware)([- ])(function)s?\b/gi;
const IDENT = /[A-Za-z0-9_$]/;
const PATH_CHAR = /[A-Za-z0-9_$./-]/;

const git = (...args) => execFileSync('git', args, {cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28});
const listFiles = () => git('ls-files', '-z').split('\0').filter((file) => file && !EXCLUDE.some((re) => re.test(file)));
const isBinary = (buf) => buf.subarray(0, 8000).includes(0);

function casing(sample, word) {
  if (sample === sample.toUpperCase() && /[A-Z]/.test(sample)) return word.toUpperCase();
  if (sample[0] === sample[0].toUpperCase()) return word[0].toUpperCase() + word.slice(1);
  return word;
}

function fullToken(text, start, end, charClass) {
  let from = start;
  let to = end;
  while (from > 0 && charClass.test(text[from - 1])) from--;
  while (to < text.length && charClass.test(text[to])) to++;
  return {from, to, token: text.slice(from, to)};
}

// Markdown prose = outside fences and inline code; a standalone word there drops the plural
function proseMask(text, isMarkdown) {
  const mask = new Uint8Array(text.length);
  if (!isMarkdown) return mask;
  let inFence = false;
  let offset = 0;
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    else if (!inFence) {
      let inCode = false;
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '`') inCode = !inCode;
        else if (!inCode) mask[offset + i] = 1;
      }
    }
    offset += line.length + 1;
  }
  return mask;
}

function replacement(match, sep, plural, prose) {
  const base = casing(match, 'middleware');
  if (sep === '-' || prose) return base;
  return plural ? base + plural : base;
}

// Returns the rewritten text and one record per match
function rewrite(text, isMarkdown) {
  const mask = proseMask(text, isMarkdown);
  const hits = [];
  const out = text.replace(OLD, (match, sep, _fn, plural, offset) => {
    const {token} = fullToken(text, offset, offset + match.length, IDENT);
    const standalone = token.length === match.length && !PATH_CHAR.test(text[offset - 1] ?? ' ') && !/[A-Za-z0-9_$/-]/.test(text[offset + match.length] ?? ' ');
    const prose = Boolean(mask[offset]) && standalone;
    const kind = prose ? 'prose' : sep === '-' ? 'kebab' : 'code';
    if (SKIP_NAMES.has(token)) {
      hits.push({token, next: token, kind: 'skipped', offset});
      return match;
    }
    const next = replacement(match, sep, plural, prose);
    hits.push({token, next: token.replace(match, next), kind, offset});
    return next;
  });
  let final = out;
  for (const [from, to] of Object.entries(OVERRIDES)) final = final.replaceAll(from.replace(OLD, (m, s, f, p) => replacement(m, s, p, false)), to);
  const proseFn = [];
  final = final.replace(PROSE_FN, (match, word, sep, _fn, offset) => {
    proseFn.push({token: match, next: word, kind: 'prose-fn', offset});
    return sep === '-' && isMarkdown && !mask[offset] ? word.toLowerCase() : word;
  });
  return {text: final, hits: hits.concat(proseFn)};
}

function renamePath(path) {
  return path
    .split('/')
    .map((segment) => segment.replace(OLD, (match, sep, _fn, plural) => replacement(match, sep, plural, false)))
    .join('/');
}

function scan() {
  const rows = new Map();
  const touched = [];
  const existingMiddleware = [];
  const collisions = [];
  for (const file of listFiles()) {
    const buf = readFileSync(join(ROOT, file));
    if (isBinary(buf)) continue;
    const text = buf.toString('utf8');
    const tokens = new Set(text.match(/[A-Za-z0-9_$]+/g) ?? []);
    const {hits} = rewrite(text, file.endsWith('.md'));
    // a new code name that the same file already uses means two things now share one name
    for (const hit of hits) if (hit.kind === 'code' && hit.next !== hit.token && tokens.has(hit.next)) collisions.push(`${file}: ${hit.token} -> ${hit.next}`);
    if (hits.length) touched.push(file);
    if (hits.length && /middleware/i.test(text.replace(PROSE_FN, ''))) existingMiddleware.push(file);
    for (const hit of hits) {
      const key = `${hit.token}\t${hit.next}\t${hit.kind}`;
      const row = rows.get(key) ?? {...hit, count: 0, files: new Set()};
      row.count++;
      row.files.add(file);
      rows.set(key, row);
    }
  }
  const paths = git('ls-files', '-z')
    .split('\0')
    .filter((file) => file && !EXCLUDE.some((re) => re.test(file)) && renamePath(file) !== file);
  return {rows: [...rows.values()].sort((a, b) => b.count - a.count), touched, existingMiddleware, paths, collisions: [...new Set(collisions)]};
}

function report(outDir) {
  const {rows, touched, existingMiddleware, paths, collisions} = scan();
  mkdirSync(outDir, {recursive: true});
  const tsv = ['name\tproposed\tkind\tcount\tfiles', ...rows.map((row) => `${row.token}\t${row.next}\t${row.kind}\t${row.count}\t${[...row.files].join(' ')}`)];
  writeFileSync(join(outDir, 'rename-candidates.tsv'), tsv.join('\n') + '\n');
  writeFileSync(join(outDir, 'rename-paths.txt'), paths.map((path) => `${path} -> ${renamePath(path)}`).join('\n') + '\n');
  writeFileSync(join(outDir, 'rename-already-middleware.txt'), existingMiddleware.join('\n') + '\n');
  writeFileSync(join(outDir, 'rename-collisions.txt'), collisions.join('\n') + '\n');
  const matches = rows.reduce((sum, row) => sum + row.count, 0);
  console.log(`${matches} matches, ${rows.length} distinct rows, ${touched.length} files, ${paths.length} paths, ${collisions.length} collisions, ${existingMiddleware.length} files already say middleware`);
  console.log(`written to ${outDir}`);
}

function apply() {
  let files = 0;
  for (const file of listFiles()) {
    const buf = readFileSync(join(ROOT, file));
    if (isBinary(buf)) continue;
    const before = buf.toString('utf8');
    const {text} = rewrite(before, file.endsWith('.md'));
    if (text !== before) {
      writeFileSync(join(ROOT, file), text);
      files++;
    }
  }
  const moves = listFiles().filter((file) => renamePath(file) !== file);
  for (const file of moves) {
    const target = renamePath(file);
    if (existsSync(join(ROOT, target))) throw new Error(`rename target exists: ${target}`);
    mkdirSync(dirname(join(ROOT, target)), {recursive: true});
    git('mv', file, target);
  }
  console.log(`rewrote ${files} files, moved ${moves.length} paths`);
}

function check() {
  const {rows, paths} = scan();
  const left = rows.filter((row) => row.kind !== 'skipped' && row.kind !== 'prose-fn');
  const proseFn = rows.filter((row) => row.kind === 'prose-fn');
  for (const row of [...left, ...proseFn]) console.log(`left: ${row.token} (${row.count}) in ${[...row.files].join(' ')}`);
  for (const path of paths) console.log(`path left: ${path}`);
  if (left.length || proseFn.length || paths.length) process.exit(1);
  console.log('clean: no old names left');
}

const [command, outDir] = process.argv.slice(2);
if (command === 'scan') report(outDir ?? join(ROOT, '.rename-scan'));
else if (command === 'apply') apply();
else if (command === 'check') check();
else {
  console.error('usage: middlefn-to-middleware.mjs scan [outDir] | apply | check');
  process.exit(2);
}
