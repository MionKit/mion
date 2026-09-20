// The one difference between a workspace manifest and the one npm serves: the `source` export
// condition. In-repo every package resolves its siblings through it (root tsconfig
// `customConditions`, the vitest configs' `resolve.conditions`), so the workspace manifest keeps
// it; the tarball carries no `src/`, and a dangling condition fails the consumer who asks for it,
// where an absent one falls through to `types`.

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

export function stripSourceCondition(manifest) {
  if (!manifest.exports) return {...manifest};
  return {...manifest, exports: withoutSource(manifest.exports)};
}
