---
type: chore
spec: guidelines
status: done
created: 2026-10-01
---

# Remove or Use the RunTypes Examples No Page Imports

## Intent

`packages/private-examples/src/` exists so website pages can `<code-import>` compiled examples. In
`packages/private-examples/src/run-types/`, 9 of the 11 files are imported by no page under
`container/website/content/`:

- `comparison-mion.ts`, `comparison-schema-first.ts`, `comparison-type-first.ts`, `comparison-typia.ts`
- `complete-example.ts`, `json-restore.ts`, `json-stringify.ts`
- `mock-data.ts`, `pure-functions.ts`

Only `validation-is-type.ts` and `validation-type-errors.ts` are used (by
`01.rpc/02.server/06.validation.md`). Dead examples still cost typecheck time and drift without anyone
noticing, since no reader sees them.

Repro: `container/website/scripts/check-unused-examples.mts` (the in-container
`pnpm run check-unused-examples`) lists every example under `packages/private-examples/src/` that no
`<code-import>` uses. It always exits 0 and nothing runs it, which is how these files piled up.

## Direction

- Decide per file: delete it, or import it from the page it belongs to (some may duplicate a `guide/`
  example that a page already uses).
- Deleting `comparison-typia.ts` also drops its `exclude` line in `packages/private-examples/tsconfig.json`
  and its entry in `scripts/core/typecheck-coverage.mjs`. The other eight come in through the `src` include
  and are named nowhere.
- The same script finds unused files in the other `src/` subdirectories too (`client/`, `guide/`,
  `introduction/`, `router/`, `enrich/`, `suites/`). Settle those the same way.
- Make the existing check fail: give it an exceptions list, exit 1, and run it in CI (or move its logic into
  a `repo-contracts.test.ts` case and delete the script). Do not add a second check.
- The implementer plans the details.

## Docs

Only if a file moves onto a page: that page, in the section the example belongs to.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

Every file under `packages/private-examples/src/` is imported by a page (or listed as an intended
exception by whatever check guards it), `pnpm run typecheck` and the website link test pass, and the
simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
each committed on its own.

## Plan (approved 2026-10-01)

### Context
`packages/private-examples/src/` exists only so website pages can `<code-import>` compiled examples. 37 files there (outside `run-types/serialization-union.ts`, which the parent PR deletes) are imported by no page, directly or through a file a page imports. None matches a hand-written fence on any page, and no page is their obvious home. The existing `container/website/scripts/check-unused-examples.mts` lists them but always exits 0 and nothing runs it. Spec refreshed from parent commit df3a8ad.

### Change
1. **Delete the 37 orphans** (`git rm`):
   - `run-types/`: comparison-mion, comparison-schema-first, comparison-type-first, comparison-typia, complete-example, json-restore, json-stringify, mock-data, pure-functions
   - `guide/`: caveats-missing-annotation, caveats-type-only-import, caveats-typeof-runtime, caveats-unions-and-any, markers-not-triggered, setup-hello-validator, setup-vite-config, validate-contract-dataonly, validate-contract-onclick
   - `introduction/`: about-client, about-server, helpers, manual-install-vite-config, one-type-one-id, pure-functions-examples, types, whatis-duality, whatis-reflection, whatis-taste
   - `client/`: client-error-slots, client-full-example, client-usage, client, server.routes
   - `router/`: extending-routes-and-middlewares.routes, myModels
   - `suites/realworld.ts` (the `suites/` dir goes)
   - Kept: files only imported by a used example (`enrich/i18n-es.ts`, `router/full-example.app.ts`, `router/myAuth.ts`).
2. **Clean the lists naming them**: `packages/private-examples/tsconfig.json` (comparison-typia, introduction entries, `src/suites`, stale `src/twoslash-test`, header comment), `tsconfig.runtypes.json` and `eslint.config.js` (`src/suites`, introduction entries), `scripts/core/typecheck-coverage.mjs` (comparison-typia), the `src/suites/realworld` comment in `container/benchmarks/shared/cases/realworld/index.ts`.
3. **One check, failing, in CI**: move the script's logic into a `repo-contracts.test.ts` case (runs in the normal JS suite), and delete `check-unused-examples.mts`, its `_deps/package.json` script line, and its mention in `container/website/CLAUDE.md`. The test:
   - collects `<code-import path="packages/private-examples/src/...">` from `container/website/content/**/*.md`;
   - follows relative imports from those files, so a helper a used example imports counts as used;
   - fails listing every unreached file, minus an `EXCEPTIONS` list holding only `run-types/serialization-union.ts`;
   - also fails when an exception names a missing file or a file a page uses, so the parent PR must drop the entry when it deletes the file;
   - plus a small temp-dir fixture case proving an orphan is reported and an imported helper is not.
4. **Website image**: editing `container/website/_deps/package.json` changes the `tsrt-website` deps hash, so rebuild and push that image (`pnpm miondevx container login`, then `container push website` with the mirror/host-network knobs if needed).

### Tests / Docs / Fuzzing
Chore. The new contract test is the test. No page changes. Run `docs-simplifier` only if the diff lists surviving pages/examples (likely none), and `comments-simplifier` on touched source files. Not a fuzz candidate.

### Finish
- `pnpm run typecheck`, `pnpm exec vitest run repo-contracts website-links`, `pnpm run lint`, `pnpm run format`.
- Append this plan to the spec, update it to what shipped, `git mv` to `docs/done/`.
- Push `chore/unused-runtypes-examples`, open PR labelled `website`.
- Tell the parent session to drop the `serialization-union.ts` exception when it rebases.

### Done when (from spec)
Every file under `src/` is imported by a page or listed as an exception by the guarding check; typecheck and the website link test pass; both simplify passes ran and are committed on their own.

## What shipped

- **35 examples deleted**, not 37: `client/client.ts` and `client/server.routes.ts` stay, because the
  client overview page's "Full Example" section links the `client/` folder as the complete client and
  server. They sit in the exceptions list with that reason. `client-usage.ts`, `client-full-example.ts`
  and `client-error-slots.ts` were smaller copies of that pair and went.
- **The check lives in `scripts/check-code-imports.mjs`, not a `repo-contracts.test.ts` case.** That script
  already parsed every `<code-import>` and already ran in CI (`ci.yml`, "Code-import check"), so the orphan
  check reuses its parser instead of copying it. It follows relative imports from every imported example,
  fails on any unreached file under `src/`, and fails on an `UNUSED_EXCEPTIONS` entry that is missing or
  now imported. `repo-contracts.test.ts` tests that logic on a temp-dir fixture.
- **The check also reads `::twoslash-code` blocks** (frontmatter `path:`). Pages show seven `_homepage/`
  examples that way; the first run flagged them as unused. A missing file there now fails too, the same
  as a broken `<code-import>`.
- `container/website/scripts/check-unused-examples.mts`, its `_deps/package.json` script and its line in
  `container/website/CLAUDE.md` are gone. The `_deps/package.json` edit moved the `tsrt-website` image
  hash, so that image was rebuilt and pushed.
- Also dropped: the stale `src/twoslash-test` exclude (the directory no longer exists) and the
  `comparison-typia.ts` entries in `tsconfig.json` and `typecheck-coverage.mjs`.
- `UNUSED_EXCEPTIONS` still lists `run-types/serialization-union.ts`; the parent branch deletes that file
  and must drop the entry, or the stale-exception rule fails.
- No page changed, so the simplify-docs pass had nothing to read.
