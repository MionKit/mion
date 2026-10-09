# PR readiness

Never open a PR unless it is PR ready. Read before opening a PR or labelling one.

## Hard gate (new feature, or significant change to one)

- Front-end tests exist and pass: every new or changed behaviour has Vitest coverage under
  [packages/](../../packages/) (`.spec.ts` / `.test.ts`). Run the whole JS suite: `pnpm test`.
  Go-side changes also need `go -C ts-go-runtypes test ./internal/... ./cmd/...`.
- Docs updated, especially the website: content tree [container/website/content/](../../container/website/content/),
  per [website-writing.md](website-writing.md).
- Docs simplified: `docs-simplifier` subagent (never the writing session) over every touched page + example,
  committed on its own.
  Touched a page or example, no `docs(simplify):` commit → not PR ready.
- Comments simplified: `comments-simplifier` subagent (never the writing session) over every touched source file,
  committed on its own.
  Touched a source file, no `chore(comments):` commit → not PR ready.

## Specs

- PR implements a [docs/todos/](../../docs/todos/) spec → `git mv` it into [docs/done/](../../docs/done/),
  update it to match what shipped!
- Shipped only PART → SPLIT it, never park it: the moved doc records what landed, the remainder becomes a NEW
  `docs/todos/` spec that stands on its own. No half-done lane.
- Superseded spec → rewritten from scratch, never cross-referenced. Delete the old one
  (or `git mv` to `docs/done/` if part genuinely shipped). No link, "supersedes" note or summary of the old version.

## Labels: CI lanes run only when labelled

Heavy lanes are opt-in per PR ([pr-heavy.yml](../../.github/workflows/pr-heavy.yml),
[drizzle-e2e.yml](../../.github/workflows/drizzle-e2e.yml)). No label → never run, GitHub still shows green,
so an unlabelled PR can merge untested.

- `website`: builds the docs site. For [container/website/](../../container/website/) and
  [packages/private-examples/](../../packages/private-examples/) (pages import its files).
- `bench`: validation benchmarks. For [container/benchmarks/](../../container/benchmarks/) or their deps.
- `pre-publish-e2e`: packs every package, publishes to a throwaway registry, runs the consumer lanes.
  For package exports, `package.json` changes, public API renames, anything a consumer installs.
- `drizzle-e2e`: drizzle's own suites against real databases. For [packages/drizzle-orm/](../../packages/drizzle-orm/),
  its dialect packages, or [container/drizzle-e2e/](../../container/drizzle-e2e/).
- `skip-defaults`: opts OUT of the default lint / typecheck / test lanes. Only for a PR that cannot affect them.
- Adding a label re-triggers its lane → label at open time, not at the end.

## Lanes are content-gated

- Label = necessary, NOT sufficient: every lane is also gated on content ([lanes.mjs](../../scripts/ci/lanes.mjs)).
- Each lane declares the paths feeding it, hashes exactly those, runs unless a marker says that hash already passed.
  Labelled lane re-runs on a commit changing its inputs, skips one that does not. Docs-only commit skips every lane.
- Container lanes split into items (per database, bench competitor, e2e half, smoke half), each with its own
  marker → only unproven items run.
- What this tree needs: `pnpm miondevx core lanes`.
- Adding a top-level directory → classify it there. An unclassified path joins EVERY lane's hash:
  everything re-runs until someone says what reads it.

## CI restores the Go binaries

- `mion-bin/mion` + `mion-bin/extract-fn-bodies` cached under the key `pnpm miondevx core build --cache-key` prints
  (git and node only).
- [.github/actions/resolver](../../.github/actions/resolver/action.yml) = ONE place a job sets up Go + the tsgolint
  submodule, only on a cache miss or with `toolchain: 'true'`.
- CI's Go version pinned in `ts-go-runtypes/.go-version`.
