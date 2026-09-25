---
type: fix
spec: guidelines
status: done
created: 2026-09-25
---

# The devtools import contract reads other tests' temporary fixtures

## Intent

`packages/devtools/test/repo-contracts.test.ts`, test "devtools code never imports @mionjs/run-types > in src/, test/ and the vitest configs", globs `packages/devtools/test/**/*.ts` and fails on any import of `@mionjs/run-types`.

Several devtools tests write temporary fixture files into `packages/devtools/test/tmp-*/` while they run, and those fixtures import `@mionjs/run-types` on purpose. When both run at the same time, the contract test can see them (an offender) or read a file that was just deleted (ENOENT). Either way it fails for no real reason.

## Evidence

- Seen once in a full parallel `pnpm test` on 2026-09-25: 1 failed of 11540. The error text was not captured.
- The same file passes alone, and in a run of 7 projects (drizzle, devtools, devtools-core, type-budget).
- Tests that write under `test/tmp-*`: `downgrade-errors`, `references-unbuilt`, `rewrite`, `wrapper-multi-fn`, `wrapper-multi-slot`, `wrapper-zero-config` (for example `downgrade-errors.test.ts:29`, `const FIXTURE_DIR = path.resolve(__dirname, 'tmp-downgrade-errors');`).

## Where to look

- The glob in the contract test: exclude the temporary dirs, or
- move the temporary fixtures out of `test/` (for example into the OS temp dir or a gitignored dir outside the glob), which also keeps any other `test/**` scan from seeing them.
- Check whether any other contract test globs `test/**` and has the same race.

## Done when

- The contract test cannot see another test's temporary files, with a test that proves a `tmp-*` fixture importing `@mionjs/run-types` is not reported.
- The contract still fails on a real committed test file that imports `@mionjs/run-types` (negative control).

## Plan — scratch-dir exclude (approved 2026-09-25, delegated run)

Found on `main`: five of the six listed tests already write into the OS temp dir. Only `rewrite.test.ts` still wrote inside `test/` (`test/.tmp-modules`, `.js` files outside the `*.ts` glob, but still a dir the scan walked while it was being deleted).

- `repo-contracts.test.ts`: the scan now skips any dir named `node_modules`, `tmp`, or starting `tmp-` / `tmp_` / `tmp.` / `.tmp` (the `exclude` option of `globSync`), so another test's scratch files can never be read or vanish mid-scan.
- New test "skips scratch fixture dirs but still reports a real test file": builds a throwaway tree with offending imports in scratch dirs (not reported) and in `test/real.test.ts` plus `test/tmpl/helper.ts` (both reported, the negative control).
- `rewrite.test.ts`: the `--out-modules` output moves to `mkdtempSync(os.tmpdir())`.
- No other contract test globs a package `test/**` tree.
- No docs change: test-only fix.
