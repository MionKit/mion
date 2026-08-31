// hollow-builtin-purefns.mjs — strip the built-in pure-fn factory BODIES out of
// the published dist, keeping only the registration scaffolding.
//
// Why: the resolver now delivers every `rt::…` / `rtFormats::…` body on demand
// from the built-in table, so the
// side-effect-imported registration files (pure-fns-utils.js, *-pure-fns.js) no
// longer need to CARRY the bodies — they cost ~1.6 KB (`rt::`) + ~9.7 KB
// (`rtFormats::`) in every bundle. This post-build step rewrites each
// `registerPureFnFactory('<key>', <factory>)` in those dist files to
// `registerPureFnFactory('<key>', null /** <key> hollowed */)`, so the file keeps
// its exports, its line count (stack traces / maps line up), and its side-effect
// registration (now an inert no-op — see registerCore's hollowed built-in lane),
// but ships scaffolding bytes only. The `.d.ts` is untouched (the factory arg is
// not part of the declared type). The bodies still reach a consumer, on demand,
// through the pure-fn cache.
//
// Only the package-owned registration FILES are rewritten, and within them only
// `rt::`/`rtFormats::` keys — user pure fns and everything else are left alone.
//
// Usage: node scripts/core/hollow-builtin-purefns.mjs [<distDir>]
//   distDir defaults to packages/run-types/dist; both it and its dist/cjs twin
//   are processed.

import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// The built-in registration modules, relative to a dist root. Kept in sync with
// the side-effect imports in dist/index.js + dist/formats/index.js and with
// cmd/gen-builtin-purefns's builtinSourceFiles.
const BUILTIN_FILES = [
  'runtypes/pure-fns-utils.js',
  'runtypes/circular-pure-fns.js',
  'formats/string/string-formats-pure-fns.js',
  'formats/datetime/dateTime-pure-fns.js',
];

const CALL = 'registerPureFnFactory';
const BUILTIN_NS = /^(rt|rtFormats)::/;

// ---- a minimal JS scanner: enough to find the matching `)` of a
// registerPureFnFactory(...) call, skipping strings, template literals, regex
// literals, and comments so their inner delimiters never miscount. ----

function skipString(src, i) {
  const quote = src[i++];
  while (i < src.length) {
    if (src[i] === '\\') i += 2;
    else if (src[i] === quote) return i + 1;
    else i++;
  }
  return i;
}

function skipTemplate(src, i) {
  i++; // past the opening backtick
  while (i < src.length) {
    if (src[i] === '\\') {
      i += 2;
      continue;
    }
    if (src[i] === '`') return i + 1;
    if (src[i] === '$' && src[i + 1] === '{') {
      i += 2;
      let depth = 1;
      while (i < src.length && depth > 0) {
        const c = src[i];
        if (c === '{') (depth++, i++);
        else if (c === '}') (depth--, i++);
        else if (c === "'" || c === '"') i = skipString(src, i);
        else if (c === '`') i = skipTemplate(src, i);
        else i++;
      }
      continue;
    }
    i++;
  }
  return i;
}

function skipLineComment(src, i) {
  while (i < src.length && src[i] !== '\n') i++;
  return i;
}

function skipBlockComment(src, i) {
  i += 2;
  while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
  return i + 2;
}

function skipRegex(src, i) {
  i++; // past the opening slash
  let inClass = false;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    else if (c === '/' && !inClass) return i + 1;
    else if (c === '\n') return i; // unterminated — bail
    i++;
  }
  return i;
}

// A `/` starts a regex (not division) when the previous meaningful char cannot
// end an expression — i.e. it is an operator, an opener, or nothing. The set is
// the standard JS heuristic; these tsc-emitted bodies only ever use `/` for
// regex literals, so the classification is unambiguous in practice.
const REGEX_ALLOWED_BEFORE = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^', 'n', 'f', 'return'.charCodeAt(0)]);
function regexAllowedAfter(prev) {
  if (prev === '') return true;
  return REGEX_ALLOWED_BEFORE.has(prev);
}

// findCallCloseParen returns the index of the `)` that closes the call whose
// opening `(` is at openParen. Scans with paren depth, skipping literals.
function findCallCloseParen(src, openParen) {
  let i = openParen;
  let depth = 0;
  let prev = '';
  while (i < src.length) {
    const c = src[i];
    if (c === "'" || c === '"') {
      i = skipString(src, i);
      prev = c;
      continue;
    }
    if (c === '`') {
      i = skipTemplate(src, i);
      prev = '`';
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      i = skipLineComment(src, i);
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      i = skipBlockComment(src, i);
      continue;
    }
    if (c === '/' && regexAllowedAfter(prev)) {
      i = skipRegex(src, i);
      prev = '/';
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return i;
    }
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return -1;
}

// hollowSource rewrites every built-in registerPureFnFactory call in one dist
// file. Returns {code, count}. Idempotent: an already-hollowed call (factory arg
// literally `null`) is skipped.
export function hollowSource(src, file = '<memory>') {
  let out = '';
  let cursor = 0;
  let count = 0;
  for (let at = src.indexOf(CALL); at !== -1; at = src.indexOf(CALL, at + 1)) {
    // `CALL` must be a standalone identifier — the char on each side is not part
    // of a longer identifier. This matches both the ESM shape
    // (`registerPureFnFactory(`) and the tsc CJS shape
    // (`(0, mod.registerPureFnFactory)(`), where a member access precedes it and
    // a `)` follows before the args paren.
    const before = src[at - 1];
    const after = src[at + CALL.length];
    if (before && /[A-Za-z0-9_$]/.test(before)) continue;
    if (after && /[A-Za-z0-9_$]/.test(after)) continue;
    // Locate the ARGS open paren: skip whitespace; step over the CJS
    // `(0, …name)` wrapper's closing `)`; then expect `(`.
    let j = at + CALL.length;
    while (j < src.length && /\s/.test(src[j])) j++;
    if (src[j] === ')') {
      j++;
      while (j < src.length && /\s/.test(src[j])) j++;
    }
    if (src[j] !== '(') continue; // a reference to the name that is not a call
    const openParen = j;
    const close = findCallCloseParen(src, openParen);
    if (close === -1) throw new Error(`${file}: unbalanced ${CALL}( at offset ${at}`);

    // Parse the first argument: the '<ns>::<fn>' key literal.
    let k = openParen + 1;
    while (k < close && /\s/.test(src[k])) k++;
    if (src[k] !== "'" && src[k] !== '"') continue; // not a string-literal key — leave it
    const keyEnd = skipString(src, k);
    const key = src.slice(k + 1, keyEnd - 1);
    if (!BUILTIN_NS.test(key)) continue; // user key — never hollow

    // The factory argument starts after the `,` following the key.
    let comma = keyEnd;
    while (comma < close && /\s/.test(src[comma])) comma++;
    if (src[comma] !== ',') continue;
    let factoryStart = comma + 1;
    while (factoryStart < close && /\s/.test(src[factoryStart])) factoryStart++;

    const factory = src.slice(factoryStart, close);
    if (factory.trimEnd() === 'null' || factory.startsWith('null ')) continue; // already hollow

    const newlines = (factory.match(/\n/g) || []).length;
    // Replacement occupies the SAME number of lines so maps/traces line up.
    const replacement = `null /** ${key} hollowed — body ships on demand${'\n'.repeat(newlines)}*/`;

    out += src.slice(cursor, factoryStart) + replacement;
    cursor = close;
    count++;
  }
  out += src.slice(cursor);
  return {code: out, count};
}

function processDistRoot(distRoot, label) {
  if (!existsSync(distRoot)) return {files: 0, hollowed: 0};
  let files = 0;
  let hollowed = 0;
  for (const rel of BUILTIN_FILES) {
    const path = join(distRoot, rel);
    if (!existsSync(path)) continue;
    const src = readFileSync(path, 'utf8');
    const {code, count} = hollowSource(src, `${label}/${rel}`);
    if (count === 0) continue;
    if (src.split('\n').length !== code.split('\n').length) {
      throw new Error(`${label}/${rel}: line count changed (${src.split('\n').length} -> ${code.split('\n').length}) — hollowing must preserve it`);
    }
    writeFileSync(path, code);
    // Fail loudly if the rewrite produced invalid JS.
    execFileSync(process.execPath, ['--check', path]);
    files++;
    hollowed += count;
  }
  return {files, hollowed};
}

function main() {
  const distArg = process.argv[2];
  const distRoot = distArg ? join(REPO_ROOT, distArg) : join(REPO_ROOT, 'packages/run-types/dist');
  const esm = processDistRoot(distRoot, 'dist');
  const cjs = processDistRoot(join(distRoot, 'cjs'), 'dist/cjs');
  const total = esm.hollowed + cjs.hollowed;
  if (total === 0) {
    console.error('hollow-builtin-purefns: no built-in registrations found to hollow (already hollow, or dist not built?)');
    return;
  }
  console.error(`hollow-builtin-purefns: hollowed ${total} built-in registration(s) across ${esm.files + cjs.files} dist file(s)`);
}

// Run only when invoked directly (`node hollow-builtin-purefns.mjs`), not when a
// test imports hollowSource.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
