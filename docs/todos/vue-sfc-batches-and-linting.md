---
type: fix
spec: guidelines
status: ready
created: 2026-11-02
---

# Batches and lint rules in Vue apps: injected clients, `.vue` linting, SFC-only batches

## Intent

Idiomatic Vue and Nuxt code cannot batch or lint with mion today; the starters had to move every batch into `.ts`
modules with a module-level client. Found while porting the mion-starters Vue and Nuxt starters to 0.13.2;
investigation in the mion-starters repo, `docs/investigations/mion-0.13-migration/` (README rows 13-15, `vue.md`
issues 4-5, `nuxt.md` issues 3, 7-8, repro `repros/batch-destructure`).

1. **Batch reader.** `const {routes} = initClient(...)` and `const routes = client.routes` work, but
   `const {routes} = client` (an imported client, a same-file client, a Vue `inject()` composable, `useNuxtApp()`)
   fails with `rpc-batch-element-unreadable`, whose advice ("bind it to a const") is what the code already does.
2. **Lint on `.vue`.** The mion ESLint rules answer every `.vue` file with
   `resolver failed: scanFiles […].vue: source file not in program`; the docs promise the linter shows build
   errors in the editor.
3. **SFC-only batches** exist only for builds that transform that SFC: a separately built API never sees them and
   answers `404 batch-unknown-id`. Undocumented.

## Direction

The implementer plans the fixes. Verified pointers:

- `ts-go-runtypes/internal/compiler/requestbatch/routes.go:216-256` (`bindingElementPath` only accepts an
  `initClient()` initializer, line 247); the variable-declaration branch at `:180-197` already follows access
  chains. Decide how far tracing should go (a value returned from `inject()` cannot be traced; say so in the
  diagnostic and the docs).
- `packages/devtools/src/lint/lint-worker.ts:85-106` sends the raw SFC under its `.vue` path; the Vite preset
  already registers the extracted script as a virtual `Comp.vue.ts` (`packages/devtools/src/vite/sfcTransform.ts`).
  Lint rules live in the compiler (`packages/devtools/src/lint/AGENTS.md`).
- SFC-only batches: at minimum document it; consider a build diagnostic when a separate server build misses a batch
  the program has.
- Marker API tests cover both `getRunTypeId` call shapes (root `AGENTS.md`).

## Docs

`container/website/content/01.rpc/04.client/03.batch.md` "Writing a Batch the Build Can Read" (client origins the
build can trace), `01.rpc/07.devtools/02.vite.md` "Vue Single-File Components" (SFC batches and separate builds),
`01.rpc/07.devtools/01.linter.md` "Installing the Plugin" or "Recommended Config" (`.vue` support).

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- A client destructured from a traceable client compiles in a batch, an untraceable one gets a diagnostic that says
  why, and the mion lint rules run on `.vue` files, each pinned by tests.
- The SFC batch limitation is documented or removed.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.

## Plan: Vue batches, .vue linting, SFC-only batch docs (approved 2026-11-02)

### Context

Vue/Nuxt code cannot batch or lint with mion:
1. `const {routes} = client` fails `rpc-batch-element-unreadable` (only `= initClient()` is accepted for a destructure).
2. Lint answers every `.vue` file with `source file not in program`.
3. A batch written only in a `.vue` file is unknown to a separately built API (404 `batch-unknown-id`). Undocumented.

### 1. Batch reader (Go)

`ts-go-runtypes/internal/compiler/requestbatch/routes.go`
- New helper `initializerPath(initializer, depth) ([]string, reason)`: `initClient()` call → `[]`;
  access chain (`client`, `api.client`, `client.routes`) → `resolveRootPath`; a call result → new `reasonCallResult`.
- `bindingElementPath` uses it instead of requiring `initClient()`: `const {routes} = client` (same file, imported,
  namespace, nested destructure) now resolves. Reassigned-`let` guard kept.
- Variable-declaration branch of `resolveSymbolPath` uses the same helper (one road for both).
- `accessChain`: a call at the chain root (`useNuxtApp().$client.routes…`, `inject(...)`) → `reasonCallResult`
  instead of the generic chain-root reason.
- Tracing stops at function calls (`inject()`, composables, `useNuxtApp()`): runtime values the build cannot follow.
  `reasonCallResult` says so: "client comes from a function call the build cannot follow (`inject()`, a composable, …)".
- Message advice (`diagnostics/messages.go`) + prose Summary (`prose.go`): say `routes` must come from `initClient()`
  through `const`s and imports. Regenerate the TS catalog (`pnpm miondevx core codegen all`).

Tests (`requestbatch/batches_test.go`): accepted rows in `TestShapes_RootShapes` (destructure from same-file client,
renamed, nested, from `c.routes`) and `TestShapes_ImportedRoutes` (`const {routes} = client` from an imported client,
from `api.client`); rejection rows (destructure from a helper call, from `inject()`-like call, call-rooted chain) with
`reasonCallResult`. JS twin rows in `packages/devtools/test/batch-diagnostics.test.ts`. No marker API touched, so the
`getRunTypeId` pairing rule does not apply.

### 2. Lint on `.vue` (devtools)

Facts checked with real oxlint 1.75: it calls the rule once per `<script>` block with only that block's text, maps
positions itself, and crashes on a report outside the block. ESLint (with vue-eslint-parser) hands the full SFC.

New `packages/devtools/src/lint/vueSfc.ts` (pure, testable):
- Find `<script>` blocks (no `src`) with a small scanner; build a virtual module = the full file with everything
  outside script contents blanked (newlines kept), so line/column match the `.vue` file 1:1. Both blocks become
  one module (Vue merges them too; a type in one is seen by the other).
- Text with a `<script` tag = full SFC (ESLint): positions as-is.
- Text without one = one oxlint block: read the `.vue` from disk, find the block equal to the text, build the module
  from the whole file, keep only diagnostics inside that block, shift them to block-relative positions. Block not
  found (unsaved edit) → lint the text alone.
- Virtual path `Comp.vue.<lang>` (same naming as `vite/sfcTransform.ts`), so relative imports resolve unchanged.

`lint-worker.ts`: for `.vue`, send the virtual module under the virtual path, map diagnostic file paths back to
the `.vue` file and apply the position shift.

Tests: unit tests for `vueSfc.ts` (both shapes, two blocks, block-relative shift, out-of-block drop, unsaved
fallback); an oxlint e2e case in `test/eslint/oxlint-e2e.test.ts` with a real `.vue` file reporting a mion finding
on the right line; an ESLint-shape case through the rule with full SFC text (`plugin.test.ts` style).

### 3. SFC-only batches

Document it (the build cannot see `.vue` files a separate API build never transforms; a build diagnostic is not
possible there for the same reason). `02.vite.md` "Vue Single-File Components": a batch in a `.vue` file reaches
only an API built in the same Vite run; a separately built API answers `batch-unknown-id`; keep such batches in
`.ts` files. Dev-mode registration race stays with the dev-reload session.

### Docs

- `04.client/03.batch.md` "Writing a Batch the Build Can Read": where `routes` may come from (✅ `initClient()`,
  a destructure of an imported or same-file client; ❌ `inject()` / composables / `useNuxtApp()`).
- `07.devtools/02.vite.md` "Vue Single-File Components": the SFC batch limit above.
- `07.devtools/01.linter.md` "Recommended Config": `.vue` files are linted (ESLint needs `vue-eslint-parser`).

### Finish

Gate: `go -C ts-go-runtypes test ./internal/...`, rebuild binary + `@mionjs/devtools`, `pnpm test`, `pnpm run lint`,
`pnpm run format`. Reconcile spec, append this plan, `git mv` to `docs/done/`. review-pr, then docs-simplifier +
comments-simplifier in parallel (own commits). PR linking parent session, CI to green. No fuzzing: fix, not feature.
