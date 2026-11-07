---
type: fix
spec: guidelines
status: done
created: 2026-11-07
---

# The release bump skips the private tools/\* workspace packages

## Intent

`scripts/release/bump-version.mjs` says it stamps "every workspace package.json (published and private,
so the lockstep stays exact)", but it only scans `packages/*`. `pnpm-workspace.yaml` also lists `tools/*`,
so `tools/code-card/package.json` stayed on 0.12.2 while every lockstep package moved on (0.13.2 at the time).
Nothing caught the drift. Intended behavior: the script's own comment. Private tools ride the lockstep too.

## Direction

- Read the workspace package dirs from `pnpm-workspace.yaml` (its `packages:` globs), not a hard-coded
  `packages/`, so a new workspace folder can never be skipped again. Only the `<dir>/*` form is used today:
  fail loudly on any other pattern rather than silently matching nothing.
- Keep the root package.json and the drizzle-orm version line exception exactly as they are.
- Realign `tools/code-card` to the current `version.json` version.
- A drift sweep in the always-on `scripts/ci/check-tree.mjs` gate: every workspace package.json with a `version`
  (drizzle line excepted) carries the `version.json` version. Not a vitest contract: `tools/` feeds no gated lane,
  so a tools-only PR would skip it. Vitest unit tests cover the reader (blank lines, no final newline, unsupported
  globs) and the drift rule over a scratch repo.
- Shipped: `scripts/lib/workspace-dirs.mjs` (`workspacePatterns`, `lockstepManifestFiles`, `lockstepDrift`),
  used by both the bump and the sweep.
- The implementer plans the details.

## Docs

Docs: none, because no site page or example covers the bump script; its header comment is updated in place.

## Done when

- The bump stamps `tools/*` manifests, the contract test fails on a drifted manifest, `tools/code-card` is
  on the lockstep version.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.
