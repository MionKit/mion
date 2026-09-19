// The one difference between a workspace manifest and the one npm serves.
//
// In-repo every package resolves its siblings through the `source` export condition
// (root tsconfig `customConditions: ["source"]`, the vitest configs' `resolve.conditions`),
// so the workspace manifest must keep it. The tarball carries no `src/`, so shipping the
// condition would point a consumer who asks for it at files that are not there — and a
// dangling condition fails that consumer, where an absent one just falls through to `types`.

// Deep copy of `exports` with every `source` condition removed, at any nesting depth.
function withoutSource(node) {
  if (Array.isArray(node)) return node.map(withoutSource);
  if (!node || typeof node !== 'object') return node;
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'source') continue;
    out[key] = withoutSource(value);
  }
  return out;
}

// The manifest as published: same object, no `source` condition anywhere in `exports`.
export function stripSourceCondition(manifest) {
  if (!manifest.exports) return {...manifest};
  return {...manifest, exports: withoutSource(manifest.exports)};
}
