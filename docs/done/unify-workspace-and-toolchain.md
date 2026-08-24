# Unify the workspace and toolchain after the join (merge master plan, step 3)

**Status:** done (2026-08-24)
**Created:** 2026-08-24

Step 3 of [../todos/merge-ts-runtypes-into-mion-master-plan.md](../todos/merge-ts-runtypes-into-mion-master-plan.md).
The repo is now one project rather than two sharing a directory: the mion packages build
against the sibling runtypes sources, there is one formatter, one linter, one test run and
one script set, and lerna/nx are gone.

## What shipped

- **`packages/drizze` → `packages/drizzle`.** The directory had been misspelled against its
  `@mionjs/drizzle` package name since creation, which also left the root tsconfig's
  `@mionjs/*` → `packages/*` mapping pointing at a directory that did not exist.
- **lerna + nx deleted** (`lerna.json`, `nx.json`, `packages/client/project.json`, both
  devDependencies, the `.nx` cache). The lerna-driven root scripts became plain pnpm
  recursion. mion's manual OTP publish scripts (`scripts/publish.sh`, `scripts/unpublish.sh`
  and their `npm-publish` / `npm-unpublish` aliases) went with them: they were built on
  `lerna version` / `lerna publish`, and the repo releases through the rtx release train.
  `scripts/pre-publish-test.sh` lost its one `lerna ls` call and still passes.
- **`workspace:*` everywhere.** Every `@ts-runtypes/{core,devtools,bin}` dependency in core,
  router, client, drizzle, devtools, platform-bun, test-server and examples is a workspace
  link; `@ts-runtypes/*` is out of `minimumReleaseAgeExclude`. External devDependencies moved
  to the root, `drizzle-orm`'s two ranges became the exact resolved version, and
  `packages/examples` dropped its own older typescript / `@types/node`.
- **One formatter.** oxfmt covers every `packages/**/*.ts`: the `.oxfmtrc` ignore list, the
  `.editorconfig` four-space rule for the mion directories and the `.prettierignore` entry
  that also froze `packages/examples/src/_homepage` are all gone. The reformat is one commit
  (293 files), recorded in `.git-blame-ignore-revs`.
- **One linter.** oxlint covers every package and is the single home for the `runtypes/*`
  rules; eslint keeps only mion's own plugin rules and stops at the mion directories.
  `pnpm run lint` runs both plus typecheck.
- **One vitest project list.** `vitest.mion.config.ts` is gone; `test:ci` batches the same
  root config with `--project` filters. The root tsconfig references finally name every
  workspace project (drizzle, platform-cloudflare, platform-vercel and examples were missing
  even before the merge), and `scripts/core/clean.mjs` knows about the trees the mion
  packages generate.
- **One CI gate.** `ci.yml` absorbed the three lanes that were unique to `pull-requests.yml`
  (code-import check, mion examples typecheck, `test:bun`) and that workflow is retired. Once
  the mion tests resolve the runtypes packages from the workspace they need the Go toolchain,
  so a second toolchain-free workflow bought nothing.
- **Env registry.** `GENERATE_ROUTER_SPEC`, `MION_SUPPRESS_DUAL_LOAD_WARN`, `MION_TEST_PORT`
  and `MION_TEST_SERVER_AUTO_START` are registered and mirrored into `.env.sample`; the
  naming rule gains `MION_` alongside `RT_`.

## The vite 8 hazard: root cause and fix

Step 2 recorded that building test-server's edge/cloudflare bundles with vite 8 broke two
platform specs, and guessed that `paramsJitFns.restoreFromJson` became a noop through a
registry side effect in the inlined `@ts-runtypes/core`. That guess was wrong, and the pin it
motivated is gone.

The generated caches are byte-identical between the vite 7 and vite 8 builds, and
`restoreFromJson` is not a noop: it resolves to the real compiled function. The bundles are
built as an **iife** and evaluated as a **script** (`EdgeVM` / miniflare `initialCode`), where
sloppy mode is the default. Rollup opened the wrapper with `"use strict";`. Rolldown does not.
So under vite 8 every module in the bundle ran sloppy, and a failed property assignment
silently did nothing instead of throwing: the compiled restore fn `v.date = new Date(v.date)`
applied to a string returned the string unchanged, so a bad param reached validation
(`validation-error`) instead of failing to deserialize (`serialization-error`) — a
node-vs-edge parity break.

Both vite configs put the directive back through `output.intro`, and `buildTestBundle.ts`
asserts it on every build (alongside the existing built-from-source assertion), so the
invariant cannot regress silently. `packages/test-server`'s `vite: 7.3.2` devDependency is
deleted and the whole repo is on vite 8.

## Findings fixed along the way

- **Four undeclared dependencies**, each of which only ever resolved because the registry copy
  of `@ts-runtypes/*` sat hoisted in the root `node_modules`: `test-server` and
  `@mionjs/devtools` import `@ts-runtypes/core`, `packages/examples` imports
  `@ts-runtypes/devtools`, and the root `eslint.config.js` imports
  `@ts-runtypes/devtools/eslint`. All four are declared now.
- **`@mionjs/devtools` inlined a second copy of the resolver.** `ssr: true` only
  auto-externalizes real node_modules packages, so once `@ts-runtypes/*` became workspace
  links vite treated them as local source and bundled the resolver client and the binary
  launcher into the published output, next to the dependency entries still asking consumers
  to install them. The vite-plugin build names them external explicitly.
- **`@mionjs/devtools`' committed `build/` is now a build artifact**, rebuilt by
  `pnpm run check:builds` like the runtypes dists.
- **`fetchOptions.headers` were silently dropped** unless they were a plain object.
  `HeadersInit` also allows a `Headers` instance (no own enumerable properties, so spreading
  it yielded nothing) and an array of pairs (which spread as numeric indices). Found by
  extending oxlint over the mion packages; fixed with a normalizer and its own spec.
- **`BinaryBodyResult.release` is a property, not a method**, because every caller
  destructures it.
- **The pre-commit hook rejected any mion-only commit** since the join: oxfmt exits non-zero
  when every file lint-staged hands it is excluded by `.oxfmtrc`.
- **`scripts/setup-claude-web.sh` built the resolver without its `-ldflags`**, so the binary
  reported version `dev` and the next `check:builds` discarded it on a build-id mismatch. It
  goes through `scripts/core/build.mjs` now.
- Two dead links to `default-branch-rename-references.md` (it lives in `docs/done/`) and
  `SETUP.md`'s clone URL still naming the old `ts-runtypes` repo.

## Green bar

`pnpm install --frozen-lockfile`, `pnpm run check:builds`, `pnpm test` (15 projects, 10,261
tests), `pnpm run test:bun`, `go -C ts-go-runtypes test ./internal/...`, `pnpm run lint`,
`pnpm run check-format`, `pnpm run check:env`, `pnpm run check-code-imports`,
`pnpm run check-types-examples`. `pnpm why` resolves `@ts-runtypes/core` to the workspace
link in every mion package.
