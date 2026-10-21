---
type: fix
spec: guidelines
status: done
created: 2026-09-25
---

# The devtools import contract test races the wrapper tests' temp fixtures

## Intent

The repo-contract case "devtools code never imports @mionjs/run-types" (`packages/devtools/test/repo-contracts.test.ts`, the `in src/, test/ and the vitest configs` test) globs `test/**/*.ts` in `packages/devtools`. Three sibling tests write fixture files that import `@mionjs/run-types` INSIDE that tree, while the same parallel run is going:

- `packages/devtools/test/wrapper-multi-fn.test.ts` (`FIXTURE_DIR = path.resolve(__dirname, 'tmp-wrapper-multi-fn')`)
- `packages/devtools/test/wrapper-zero-config.test.ts` (`tmp-wrapper-zero-config`)
- `packages/devtools/test/wrapper-multi-slot.test.ts` (`tmp-wrapper-multi-slot`)

When the glob runs while one of those dirs exists, the contract test lists the fixture files as offenders and fails. Seen once in three `pnpm exec vitest run --project devtools-core` runs (it passes alone). A flaky CI gate reads as red on unrelated PRs.

## Direction

`packages/devtools/CLAUDE.md` already says build fixtures live in their own temp dir, never inside another package's tree. Likely fix: move those three fixture dirs under `os.tmpdir()` (the pattern `batch-diagnostics.test.ts` uses with `mkdtempSync`), checking first whether they sit in the package on purpose (module resolution to the workspace `node_modules`, the marker package overlay). Excluding `test/tmp-*/**` from the contract glob is the fallback if they must stay. The implementer plans the details.

## Docs

None, because this is a test-only change.

## Done when

- The contract test cannot see fixture files from a concurrent test, with a repeated `devtools-core` run green.
- The simplify-comments pass ran on every touched source file, committed on its own.

## What shipped (2026-09-25)

Fixed in the same PR as the nested marker call fix, not in a separate session. Five devtools tests, not three, made their fixture dir inside `packages/devtools/test/`: the three wrapper tests plus `references-unbuilt.test.ts` and `downgrade-errors.test.ts`. Each now uses `fs.mkdtempSync(path.join(os.tmpdir(), 'rt-<name>-'))`. Nothing tied them to the package tree: every one copies the marker package in with `writeMarkerPackage`. The contract glob is unchanged. `rewrite.test.ts` still writes `.tmp-modules/` under `test/`, but only `.js` files, which the `*.ts` glob never matches.

Proof: a `.ts` file importing `@mionjs/run-types` left under `test/tmp-*/` fails the contract test; two full `devtools-core` runs after the move were green.

