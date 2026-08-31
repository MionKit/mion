// The closed set of decisions a row may carry. Marking picks a NAME from this list and
// never writes code, which is what keeps the shards reviewable and `apply` predictable.
//
// `targets.json` supplies the replacement strings. Until it is filled in, `apply` refuses
// to run any renaming transform, so the shards can be produced and marked long before the
// naming decisions are settled.

export const TRANSFORMS = {
  // Leave the occurrence exactly as it is.
  keep: {renames: false, why: 'not the package name'},

  // Historical record under docs/done. Never rewritten, so the archive keeps describing
  // the world as it was when it was written.
  freeze: {renames: false, why: 'historical record'},

  // Machine-owned output. `apply` skips the file and the phase re-runs its generator, so
  // the generated text and its source can never disagree.
  regenerate: {renames: false, why: 'regenerate, do not edit'},

  // Needs a human. `apply` refuses to start while any row carries this.
  manual: {renames: false, why: 'needs a decision'},

  // The package rename is a per-package MAP, not a scope swap: @ts-runtypes/core cannot
  // become @mionjs/core, because the mion framework already owns that name. `mapped: true`
  // routes it through targets.packages instead of a pattern.
  'npm-scope': {renames: true, mapped: true},
  'pkg-dir': {renames: true, target: 'pkgDir', pattern: /ts-runtypes/gi},
  // Same target as pkg-dir, different shape: these live inside camel/Pascal identifiers
  // (tsRuntypesPlugin), where the dashed pattern above would never match.
  'pkg-ident': {renames: true, target: 'pkgDir', pattern: /Runtypes?|runtypes?/},
  'go-module': {renames: true, target: 'goModule', pattern: /ts-runtypes/gi},
  // Longest-first: ts-GO-runtypes must be replaced whole, or the npm pattern would eat
  // its tail and leave `ts-go-` stranded in front of the new name.
  'go-dir': {renames: true, target: 'goDir', pattern: /ts-go-runtypes/gi},
  'gen-dir': {renames: true, target: 'genDir', pattern: /runtypes/gi},
  'env-var': {renames: true, target: 'envPrefix', pattern: /^RT(?=_)|^TS_RUNTYPES/},
  image: {renames: true, target: 'imagePrefix', pattern: /^tsrt/},
  'cli-bin': {renames: true, target: 'cliBin', pattern: /ts-runtypes/gi},
  'lint-rule': {renames: true, target: 'lintRule', pattern: /^runtypes/},
  'repo-url': {renames: true, target: 'repoUrl', pattern: /MionKit\/ts-run-types/gi},
  // The docs site identity: the RT_SITE value, the sites/<name> content tree and the
  // live runtypes.pages.dev domain. Its own transform because renaming it moves a LIVE
  // URL, which is a heavier call than any of the internal renames.
  site: {renames: true, target: 'siteId', pattern: /runtypes/gi},
  prose: {renames: true, target: 'brand', pattern: /RunTypes/g},
};

export const TRANSFORM_NAMES = Object.keys(TRANSFORMS);

export function isKnownTransform(name) {
  return Object.hasOwn(TRANSFORMS, name);
}

// One spelling change, four ways to write it. Every renaming transform runs through this
// so a single target value covers `ts-runtypes`, `tsRuntypes`, `TsRuntypes` and
// `TS_RUNTYPES` without a rule per casing.
export function detectCase(token) {
  if (/^[A-Z][A-Z0-9_]*$/.test(token)) return 'screaming';
  if (/^[a-z0-9]+(-[a-z0-9]+)*$/.test(token)) return 'kebab';
  if (/^[a-z0-9]+(_[a-z0-9]+)*$/.test(token)) return 'snake';
  if (/^[A-Z][a-zA-Z0-9]*$/.test(token)) return 'pascal';
  if (/^[a-z][a-zA-Z0-9]*$/.test(token)) return 'camel';
  return 'mixed';
}

// Rewrites ONE token under ONE transform. Returns the token unchanged for the
// non-renaming marks, so a caller can run every row through it uniformly.
//
// Throws when the target is still empty rather than writing a half-formed name: an empty
// target is an unmade decision, and silently producing `@/core` would be far worse than
// stopping.
export function rewriteToken(token, mark, targets) {
  const transform = TRANSFORMS[mark];
  if (!transform) throw new Error(`unknown transform ${JSON.stringify(mark)}`);
  if (!transform.renames) return token;

  if (transform.mapped) return rewriteMapped(token, targets);

  const words = targets[transform.target];
  if (!Array.isArray(words) || words.length === 0) {
    throw new Error(`target ${JSON.stringify(transform.target)} is empty in targets.json (needed by "${mark}")`);
  }

  // The pattern carries its own flags, and a /g regex holds lastIndex between calls, so
  // rebuild it per call to keep rewriteToken free of hidden state.
  const pattern = new RegExp(transform.pattern.source, transform.pattern.flags);
  const rewritten = token.replace(pattern, (matched) => applyCase(words, detectCase(matched)));

  if (rewritten === token) {
    throw new Error(`transform "${mark}" matched nothing in token ${JSON.stringify(token)}`);
  }
  return rewritten;
}

// Sentinel for a token whose package is deliberately not in this phase. The caller drops
// the edit entirely rather than writing anything.
export const OUT_OF_PHASE = Symbol('out-of-phase');

// A key only matches when the character AFTER it is not one of these. Alphanumerics and
// `_` only, chosen from the actual tokens in this tree:
//
//   `bin` + `a`  (binary-linux-x64)  must NOT match -- a different package entirely
//   `core` + `-` (core-owned)        MUST match     -- prose, "a @ts-runtypes/core-owned ns"
//   `devtools` + `.`                 MUST match     -- prose, end of sentence
//   `core` + `*` (core*)             MUST match     -- a glob in config
//
// So `-` and `.` are boundaries here even though npm allows them inside a name; the
// package family is small and known, and every real member is mapped explicitly.
const NAME_CHAR = /[A-Za-z0-9_]/;

function boundaryAt(token, from, index) {
  const after = token[index + from.length];
  return after === undefined || !NAME_CHAR.test(after);
}

function findAtBoundary(token, from) {
  let index = token.indexOf(from);
  while (index !== -1) {
    if (boundaryAt(token, from, index)) return index;
    index = token.indexOf(from, index + 1);
  }
  return -1;
}

function replaceAtBoundaries(token, from, to) {
  let out = '';
  let cursor = 0;
  for (;;) {
    const index = token.indexOf(from, cursor);
    if (index === -1) break;
    if (boundaryAt(token, from, index)) {
      out += token.slice(cursor, index) + to;
      cursor = index + from.length;
    } else {
      out += token.slice(cursor, index + from.length);
      cursor = index + from.length;
    }
  }
  return out + token.slice(cursor);
}

// Rewrites a package specifier through targets.packages.
//
// Longest key first, so `@ts-runtypes/core` is never matched by a shorter key that
// happens to be a prefix of it. A key mapped to null is out of scope for this phase and
// comes back as OUT_OF_PHASE; a key that is absent entirely is a mistake worth stopping
// for, because it means a package exists that nobody decided about.
export function rewriteMapped(token, targets) {
  const map = targets.packages ?? {};
  const keys = Object.keys(map).sort((a, b) => b.length - a.length);

  for (const from of keys) {
    const at = findAtBoundary(token, from);
    if (at === -1) continue;
    const to = map[from];
    if (to === null) return OUT_OF_PHASE;
    return replaceAtBoundaries(token, from, to);
  }

  // The bare scope with no package after it: `@ts-runtypes`, a trailing slash, or a glob
  // (`@ts-runtypes/*` in pnpm-workspace and tsconfig). There is no single package to map
  // it to, and the scope itself only disappears once every package has moved, so it waits.
  if (/@ts-runtypes\/?$/.test(token) || /@ts-runtypes\/\*/.test(token)) return OUT_OF_PHASE;

  throw new Error(`no entry in targets.packages for ${JSON.stringify(token)}`);
}

// `words` is the target as lowercase words, e.g. ['mion', 'types'].
export function applyCase(words, style) {
  switch (style) {
    case 'screaming':
      return words.map((w) => w.toUpperCase()).join('_');
    case 'snake':
      return words.join('_');
    case 'pascal':
      return words.map((w) => w[0].toUpperCase() + w.slice(1)).join('');
    case 'camel':
      return words[0] + words.slice(1).map((w) => w[0].toUpperCase() + w.slice(1)).join('');
    case 'kebab':
    case 'mixed':
    default:
      return words.join('-');
  }
}
