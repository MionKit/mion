---
type: chore
spec: guidelines
status: ready
created: 2026-09-29
---

# Remove every leftover shim for removed options, keys and aliases

## Intent

A removed option, key, alias, lint rule, CLI flag, env var or subpath must look as if it never
existed: no fallback, no alias, no "was removed, use X instead" message, no test pinning any of
that, and no doc or comment naming it. Leftovers keep dead names alive, cost code and tests, and
teach readers and coding agents names that no longer work. The root CLAUDE.md states the rule;
this todo removes what was left behind before it existed.

## Direction

The implementer plans the details. What an audit found on `main` (verify each; the list is not
guaranteed complete, so grep for "removed", "deprecated", "alias", "legacy", "kept for one
release", "no longer" and "renamed" too):

- **`RT_*` env var fallbacks**: `packages/devtools/src/core/envCompat.ts`,
  `ts-go-runtypes/internal/envcompat/envcompat.go` (+ `envcompat_test.go`, its callers in
  `cmd/mion/main.go` and `internal/jsengine/sidecar.go`), the `RT_BIN` fallback in
  `packages/bin-compiler/lib/index.js` (+ `packages/devtools/test/bin-exe-path.test.ts`),
  `packages/devtools/test/env-compat.test.ts`, and the "DEPRECATED ALIAS" notes in
  `scripts/lib/env.mjs`. The root CLAUDE.md paragraph "Five vars still answer to their old `RT_`
  name" goes with them.
- **Removed router options that still throw a hint**: `syncRoutes` and `skipClientRoutes` in
  `packages/rpc-router/src/router.ts` (+ `test/router.spec.ts`).
- **Removed tsconfig plugin keys with hints**: `removedPluginKeys` (`failOnError`, `parse`) in
  `ts-go-runtypes/cmd/mion/config.go` and `main.go` (+ `buildconfig_test.go`).
- **Removed CLI form with a hint**: the bare `release` hint in `scripts/miondevx.mjs`
  (+ `repo-contracts.test.ts`).
- **Aliases**: `outDir` for `genDir` (`packages/devtools/src/options.ts`); `FriendlyType`
  (`packages/run-types/src/index.ts`); `FormattedArrayParams*` (`packages/run-types/src/formats/`,
  + `CollectionBuilders.test.ts`); the `./schema` subpath (`packages/run-types/src/builders/index.ts`,
  `package.json` exports, `container/pre-publish-e2e/apps/shared/src/formats.ts`,
  `prefilter.test.ts`).
- **Legacy enrichment handling**: the old `FriendlyType` spelling accepted by the enrichment guard
  (`packages/devtools/src/lint/prefilter.ts`, `cmd/gen-ts-constants`, `internal/enrichment/astcheck`,
  `mirror/hygiene.go`, `mirror/index.go`, `prefilter.test.ts`); the combined-mirror migration
  (`cmd/mion/enrich_migrate.go`, `enrich_cli.go`, `enrich_gencheck.go`, `enrichgen/config.go`,
  `plan.go`, `enrichReconcile.test.ts`).
- **Wording only**: comments and test titles that name a removed thing (`--one-shot` in
  `resolver-args.test.ts`, "No shim remains" in `lint-worker.ts`, "the hand-written ESLint rules
  they replace" in `codes_mionroute.go`, `routerrules_test.go`, `plugin.test.ts`).
- **Keep**: the redirect-only upload to the old runtypes.pages.dev domain
  (`website-deploy.yml`, `container/website/legacy-runtypes/`) serves visitors of an old URL, not
  code; confirm with the owner before touching it.

Several items are public API (`FriendlyType`, `FormattedArrayParams*`, `./schema`, `outDir`, the
`RT_*` vars, the router options): removing them is a breaking change, so the commit says so and the
PR carries the `pre-publish-e2e` label. Update every doc page, example and CLAUDE.md line that names
them so the old names appear nowhere outside `docs/done/` and `CHANGELOG.md`.

## Docs

Every website page and example that names a removed item (grep `container/website/content/` and
`packages/private-examples/`), plus `SETUP.md`, the CLAUDE.md files and `.claude/skills/`.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- None of the items above has code, a test, a message, a comment or a doc left, outside
  `docs/done/` and `CHANGELOG.md`; a repo-wide grep for each old name comes back empty.
- The full JS suite, the Go tests, lint, typecheck and the pre-publish e2e lane pass.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched
  source file, each committed on its own.
