---
type: chore
spec: full-plan
status: ready
created: 2026-09-23
---

# Rename middleFn to middleware, in code and docs

## Problem

The framework calls its request hooks "middleFns" (`mion.middleFn()`, `RawMiddleFnHandler`, `middleFnIds`, ...).
Everyone else calls them middleware, and the docs already half do ("Middleware Functions" headings), so
the site mixes three names for one thing. There are no users yet, so this is a plain breaking rename: no
deprecated aliases, no compatibility layer.

Scope measured on 2026-09-23 (excluding `docs/done/` and `ts-go-runtypes/third_party/`):

- ~2,380 hits in ~180 files, ~180 distinct names. Top: `middleFns` 804, `middleFn` 702, `MiddleFn` 281,
  `MiddleFns` 177, `middleFnErrors` 97, `rawMiddleFn` 96, `middleFnResults` 81, `MiddleFnDef` 77.
- By type: 136 `.ts`, 24 `.md`, 14 `.go`, plus 1 `.mjs` and 1 generated `.json`.
- By area: router 43, client 32, examples 27, website 15, Go 14, core 8, devtools 5, pre-publish-e2e 4,
  every `platform-*` 2-3, test-server 3, test-router-fuzz 1, run-types 1, `README.md`, `CLAUDE.md`.
- 13 file paths carry the name (12 under `packages/examples/src/{client,router}/`, plus the website page
  `container/website/content/01.rpc/02.server/02.middle-fns.md`).
- Prose already says "middleware function(s)" ~70 times in 20 files.

## Plan

### Naming rules (decided)

| before | after |
|---|---|
| `middleFn` / `middleFns` | `middleware` / `middlewares` |
| `MiddleFn` / `MiddleFns` | `Middleware` / `Middlewares` |
| `middlefn` / `middlefns` | `middleware` / `middlewares` |
| `MIDDLE_FN` / `MIDDLE_FNS` | `MIDDLEWARE` / `MIDDLEWARES` |
| `middle-fn(s)` (paths, URLs, anchors) | `middleware` |
| prose "middleware function(s)", "middleFn(s)" outside code | "middleware" |

- The code plural is `middlewares`, never `middleware`. With a shared word,
  `for (const middleFn of middleFns)` would become `for (const middleware of middleware)`.
- A trailing `s` means plural only when a lowercase letter does NOT follow it: `middleFnsById` is plural,
  `MiddleFnSuccess` is singular + `Success`. Regex:
  `/(middle)([-_ ]?)(fn|function)(s(?![a-z]))?/gi` with the casing taken from the match.
- Prose is Markdown text outside fences and backticks. Code spans in Markdown follow the code rules.

### The script: `scripts/rename/middlefn-to-middleware.mjs`

Zero-dependency Node file, run with `node` (a one-off, so no `miondevx` registry row). Committed first, so a
rebase can re-run it on fresh `main` instead of hand-merging conflicts, and deleted in the last commit.

1. **`scan`**: walks `git ls-files` minus the exclude list, matches the regex above, grows each match to
   its full identifier (`[A-Za-z0-9_$-]`), and writes `rename-candidates.tsv` to the scratch dir: one row
   per DISTINCT full name with count, proposed name, kind (code identifier / string / comment / Markdown
   prose / path / Go / JSON key) and files. Also lists:
   - every file that ALREADY uses the word `middleware` (~60 files: Vite `middlewareMode`,
     `asMiddleware` in the adapters, the client's `MiddlewareSubRequest`), for a clash check;
   - every proposed name that already exists anywhere in the repo (a collision).
2. **Filter**: a `rename-skips.json` next to the script with `excludePaths` (globs), `skipNames` (keep
   as-is) and `overrides` (name → exact replacement). Reviewed once by hand. Seed values:
   - `excludePaths`: `docs/done/**`, `ts-go-runtypes/third_party/**`, `pnpm-lock.yaml`, `CHANGELOG*`.
   - `overrides`: `geMiddleFnsSize` → `getMiddlewaresSize`, `rawmiddleFndef` → `rawMiddlewareDef`,
     `middleFndef` → `middlewareDef`.
3. **`apply`**: rewrites every non-skipped match with the casing rules, `git mv`s the 13 paths, then
   rewrites every reference to an old path (`<code-import>` blocks, imports, links).
4. **`check`**: re-runs `scan` and exits non-zero if any match remains outside `skipNames` /
   `excludePaths`, or if a collision was introduced.

### Names that cross a boundary (rename both ends in the same commit)

- API manifest JSON key `middleFnIds`: Go `ts-go-runtypes/internal/compiler/apimeta/manifest.go:33,167`,
  `ts-go-runtypes/internal/compiler/resolver/apigen.go:622`, and the TS readers (`packages/core/src/types/method.types.ts:37`).
- Router rules helper recognition: `ts-go-runtypes/internal/compiler/routerrules/routerrules.go:36,52`
  (`"MiddleFnHelper"`, the `@mion:middleFn` JSDoc tag and the `"middleFn"` helper name) and the TS helpers
  they match (`mion.middleFn()`, `mion.rawMiddleFn()`, `headersMiddleFn`).
- Handler type keys `middleFn` / `headersMiddleFn` / `rawMiddleFn` in `packages/core/src/constants.ts:70-72`.
  The numeric values stay, so the wire shape does not change.
- Diagnostic messages in `ts-go-runtypes/internal/diagnostics/{messages.go,codes_mionroute.go}`. Their
  generated copies (`packages/devtools/src/core/go-generated/diagnosticCatalog.generated.ts`,
  `container/website/app/components/content/go-generated/diagnostics-catalog.json`) are regenerated with
  `pnpm miondevx core codegen diag`, never by hand. `scripts/core/gen-diagnostics-catalog.mjs:84` has one
  hit in its own text.
- The consumer lanes in `container/pre-publish-e2e/mion-consumer/` (4 files) use the public API.

### Website

- Rename the page to `container/website/content/01.rpc/02.server/02.middleware.md` and add
  `/rpc/server/middle-fns  /rpc/server/middleware  301` (and the `/*` anchor form if the file uses one) to
  `container/website/public/_redirects`.
- Headings change their anchors (`## Always Run MiddleFns` in `06.error-handling.md:85`,
  `### Sharing Data Between MiddleFns and Routes` in `01.routes.md:168`, the "Middleware Function(s)"
  headings in `03.client/*.md`). `scan` lists every heading it changes; grep the content tree for links to
  each old anchor and update them.
- Links to `/rpc/server/middle-fns#...` live in `01.routes.md:31,40`, `06.error-handling.md:87`,
  `09.security.md:27,58`.
- Wording: after `apply`, read each touched page once. Fix sentences where the swap reads badly
  (article or verb agreement, "middleware" twice in a row).

### Also in scope

- `CLAUDE.md` (the `mion.route()` / `mion.middleFn()` line) and `README.md`.
- Open specs in `docs/todos/` and ideas in `docs/maybe/` that use the old names.
- Go test names such as `TestStrongTypedRoutes_RawMiddleFnIsNotAHandler`.
- Test titles and error message strings (`'Can not add start middleFns after ...'`, `Route or MiddleFn ... not found`).

### Commit order (linear, one Conventional-Commits subject each)

1. `chore(rename): add middleFn to middleware rename script`
2. `refactor!: rename middleFn to middleware` (the `apply` output, source + Go + docs + paths)
3. `chore(codegen): regenerate diagnostics catalog`
4. hand fixes from the wording and clash review, if any
5. `chore(rename): remove rename script`
6. `docs(simplify): ...` and `chore(comments): ...` from the two passes

## Tests

No new behaviour, so no new tests. The existing suites are the check, plus the script's own `check`:

- `node scripts/rename/middlefn-to-middleware.mjs check` exits 0.
- `pnpm run check:builds` (rebuilds the `@mionjs/devtools` and marker dists that lint and Go tests read).
- `go -C ts-go-runtypes test ./internal/... ./cmd/...`
- `pnpm test` (or `pnpm run test:ci` if one run runs out of memory) and `pnpm run test:bun`.
- `pnpm run lint`, `pnpm run typecheck`, `pnpm run format`, `pnpm miondevx core codegen all --check`.
- `git grep -Ii 'middle[-_ ]\?fn'` returns only `docs/done/` and `third_party/`.

## Docs

Covered by the Website section above: the renamed page, the redirect, every page that names the old term,
and the examples under `packages/examples/src/`.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Out of scope

- `docs/done/` records keep the old name: they describe what shipped at the time.
- `ts-go-runtypes/third_party/` (off-limits submodule).
- Deprecated aliases or a migration guide: no users yet.
- Renaming other terms (`headersFn`, `route`) beyond the parts that contain `middleFn`.

## Done when

- `git grep -Ii 'middle[-_ ]\?fn'` hits only the excluded trees, and the rename script is gone.
- Go tests, `pnpm test`, `test:bun`, lint, typecheck, format and the codegen check all pass.
- `/rpc/server/middle-fns` redirects to the new page and no content link points at an old anchor.
- The PR carries the `website` and `pre-publish-e2e` labels.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched
  source file, each committed on its own.
- This spec is `git mv`d to `docs/done/` and updated to match what shipped.
