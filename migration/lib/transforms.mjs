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

  // Each renaming transform names the SUBSTRING of the token it replaces, so a rewrite
  // touches only the identifying part and leaves the rest of the path or specifier alone:
  // `@ts-runtypes/core` keeps its `@` and its `/core`.
  'npm-scope': {renames: true, target: 'npmScope', pattern: /ts-runtypes/gi},
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
