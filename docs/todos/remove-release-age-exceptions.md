---
type: chore
spec: guidelines
status: blocked
created: 2026-11-08
---

# Remove the release-age exceptions once their versions are 30 days old

## Intent

Every pnpm install here refuses versions younger than 30 days (`minimumReleaseAge: 43200`). Exceptions weaken
that guard. A security round on 2026-11-08 added exact-version exceptions (and scoped `overrides`) for fixes
that were too young. Once those versions are 30 days old the exceptions buy nothing: remove them. Same sweep
for the older exceptions whose reason has run out. Goal: no exception left that is not needed by design.

Blocked until **2026-12-08** (30 days after the newest version that round could pick). Before starting,
check every excepted version is older than 30 days (`npm view <name> time --json`); one still young → wait.

## Direction

Seven policy files: root `pnpm-workspace.yaml`, `container/website/_deps/`, `container/benchmarks/_deps/`,
`container/mion-bench/_deps/`, `container/pre-publish-e2e/_deps/`, `container/pre-publish-e2e/_deps-mion/`,
`container/drizzle-e2e/shared/_deps-common/` (each `pnpm-workspace.yaml`).

- Remove every `minimumReleaseAgeExclude` entry marked `# security fix (Dependabot), added …`.
- Every `overrides` entry with the same marker: drop it when the parent now resolves the fixed version on its
  own; keep it (marker removed, one-line reason kept) only when the parent still pins the bad range.
- Old root exceptions (`pnpm-workspace.yaml:73` on): `unplugin` (its reason, a young 3.3.0, has long expired),
  `@types/node`, the `@rolldown/binding-*` and `@rollup/rollup-*` lists. Remove them all with their comment
  blocks: cost = a later vite / rollup / `@types/node` bump waits 30 days, which is the guard working.
- KEEP `'@mionjs/*'` in `pre-publish-e2e/_deps`, `_deps-mion` and `drizzle-e2e/shared/_deps-common`:
  those runs install packages published to a local verdaccio seconds earlier, so they are always young.
- Removed entries leave no trace: no comment about what used to be there.
- Policy files feed the image hashes (`scripts/container/image.mjs`): rebuild + push the affected images,
  run their lanes once.
- The implementer plans the details.

## Docs

None, because no site page mentions the exceptions. `SETUP.md` only describes the mechanism in general:
check it still reads true.

## Done when

- The only `minimumReleaseAgeExclude` entries left in the repo are the three `'@mionjs/*'` ones.
- No `security fix (Dependabot)` marker left anywhere.
- `pnpm install` passes on the root, every affected image rebuilt, pushed, its lane green, CI green.
- The simplify-comments pass ran on every touched source file, committed on its own.
