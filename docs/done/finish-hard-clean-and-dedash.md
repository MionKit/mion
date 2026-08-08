---
type: chore
spec: full-plan
status: done
created: 2026-08-08
updated: 2026-08-08
---

# Finish: hard `clean` script + em-dash purge

Handoff note. Two tasks were done in one working session; **all changes are in the working
tree, nothing is committed**. What is left is the verification gate (build, tests, lint,
format) and the commit.

## Task 1: hard clean script — DONE

- **New** [scripts/core/clean.mjs](../../scripts/core/clean.mjs): removes package dists +
  `.tsbuildinfo` + `.coverage`, `bin/`, the website's `.output` / `.nuxt` / playground bundle,
  tool caches (vite, vitest, nuxt, playwright, `.cache/` playground WASM), run artifacts
  (`logs/`, `.docdata/`, bench results, `dist-binaries/`, `tarballs/`, test `__runtypes/`
  genDirs) and finally **every `node_modules` in the workspace**. Flags: `--keep-deps`,
  `--dry-run`. Never touches `.env`, `third_party/`, or the global pnpm store.
- `package.json`: `clean` now runs it; `fresh-start` = `clean` + `pnpm install --frozen-lockfile`.
- [scripts/rt.mjs](../../scripts/rt.mjs): `rtx clean` forwards flags, `--deep` = clean + reinstall,
  help text updated.
- Docs updated: [SETUP.md](../../SETUP.md) (new "Clean" section under Build + rtx cheatsheet),
  [CLAUDE.md](../../CLAUDE.md) dev-workflow bullet, task-reset skill's "do not run clean" warning.
- Verified: dry run on this repo lists 25 paths / 624 MB; the real delete path was exercised on a
  throwaway copy of the tree (deletes the right things, keeps source + vendored trees, idempotent).

**Side effect to keep in mind:** `pnpm rtx release preflight` calls `fresh-start`, so a preflight
now also drops `bin/`, `.docdata/` and `public/bench-data/`. The binary is rebuilt in preflight's
next step and the website build regenerates bench data, so the flow still works, but it can cost a
benchmark run that used to be skipped.

## Task 2: em-dash purge — DONE (edits), verification pending

Every rendered surface of the docs site is dash-free. Scope covered:

| Surface | Result |
| --- | --- |
| `container/website/content/index.md`, `02.guide/06.validation.md` | 0 dashes; MDC-component and code-fence counts verified identical to the pre-edit baseline (18/134/13 and 2/8/9) |
| `packages/examples/src/**` (rendered in docs via `<code-import>`) | 96 occurrences in 52 files rewritten, plus a readability pass; `oxfmt --check` clean |
| `app.config.ts` SEO title/description, user-visible UI strings (BenchTable, DetailPanel, PlaygroundStage) | rewritten |
| Go diagnostics catalog (`ts-go-runtypes/internal/diagnostics/*.go`) | 487 replacements, 0 left; `gofmt` clean; `go test ./internal/...` passes (24 packages, exit 0) |
| Generated mirrors (`diagnosticCatalog.generated.ts`, `diagnostics-catalog.json`) | regenerated via `pnpm rtx core codegen diag`, both dash-free; the generator's own header template in `scripts/core/gen-diagnostics-catalog.mjs` was fixed too |
| Website source comments (Vue / TS / CSS) | 133 dashes across 21 files |

Deliberately left alone: the em-dash **glyph** used as the "no data" cell marker in
`BenchTable.vue` (`valid: '—'`). It is data, not prose. One line to change if wanted.

Also done along the way: `pnpm install --frozen-lockfile`, because
`packages/ts-runtypes/node_modules/@ts-runtypes` was missing on this host and vitest could not
resolve `@ts-runtypes/devtools/vite`. That was a pre-existing condition, not caused by these edits.

## Verification gate (run 2026-08-08, second session)

All five leftover steps were completed on branch `chore/hard-clean-and-dedash`:

1. **Rebuild**: `pnpm rtx core build all` detected the stale binary (build ID mismatch) and
   the stale devtools dist, rebuilt both.
2. **JS suite**: exactly one test pinned old diagnostic wording —
   `test/eslint/routing.test.ts` asserted the FT002 headline with its em-dash. Expectation
   updated to the new wording; full suite then green (287 files, 11281 tests passed).
3. **Go suite**: `go -C ts-go-runtypes test ./internal/...` all ok. `pnpm run lint` exit 0
   (includes the examples typecheck, so the 52 rewritten example files still compile);
   `pnpm run format` changed nothing; `check-format` clean.
4. **Diagnostics diff skimmed**: rewrites are consistently mechanical (`Fix —` → `Fix:`,
   label dashes → colons, clause joins → commas, paired dashes → parentheses), no
   punctuation artifacts found.
5. **Dash re-grep over all claimed surfaces** confirmed the table above, and caught four
   straggler prose-comment dashes the first pass missed — fixed here:
   `BenchTable.vue` (one HTML comment), `server/utils/code-import.ts`,
   `server/utils/repo-root.ts`, `scripts/build-playground.mjs`. Remaining hits are all
   out of scope: the deliberate `'—'` no-data glyph (kept), the untracked
   `app/playground/.vendor/` build output (regenerated from package sources, whose runtime
   error strings were never in scope), `go-generated/README.md` (contributor notice, not
   rendered), and the new `scripts/core/clean.mjs`'s own comments (not a website surface).
