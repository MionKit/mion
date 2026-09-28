---
type: chore
spec: guidelines
status: ready
created: 2026-09-28
---

# One text field per diagnostic, and no derived severity in the catalog

## Intent

The generated diagnostics catalog carries two pairs of fields that look like duplicates. Each pair has one
field doing the real work and one that only adds noise or, worse, misleads.

- **`level` and `severity`.** `level` is the real classification (`error`, `runtimeError`, `warning`, `info`);
  every behavior reads it: what halts a build, what may be downgraded or silenced, lint routing. `severity` is
  only the tsc-style label (`error`, `warning`, `info`), always computed from `level` (`severityOf` in
  `ts-go-runtypes/internal/diagnostics/catalog.go`), and it merges both error levels into one word. In the
  catalog files nothing needs it: the website never reads it, and only `routing.test.ts` does.
- **`summary` and `detail`.** Both are website-only; the build, the CLI and the linter print only the headline.
  `summary` is the plain website text (`prose.go`, 38 of 160 codes). `detail` is older long text
  (`messages.go`, 157 codes) that the All Diagnostics page shows under a "Full build message" box. The build
  never prints it, so that label tells users something false. The 38 codes with a summary also have a detail
  saying roughly the same thing.

Goal: one text field per code, in the site's plain style, and no derived `severity` in the catalog.

## Direction

The implementer plans the details. What was checked:

- **Keep `level`, drop `severity` from the two generated catalogs**:
  `packages/devtools/src/core/go-generated/diagnosticCatalog.generated.ts` and
  `container/website/app/components/content/go-generated/diagnostics-catalog.json`. The generators are
  `ts-go-runtypes/cmd/gen-diag-catalog/main.go` and `scripts/core/gen-diagnostics-catalog.mjs`
  (`pnpm miondevx core codegen diag`). `routing.test.ts` derives the severity it needs from `level`.
- **Keep `severity` on the live wire `Diagnostic`** (Go `Diagnostic.Severity`, TS `protocol.ts`): the build's
  tsc-style lines, `FormatDebug`, the halt count and the playground read it. Out of scope here.
- **Merge `detail` into `summary`** for every code: rewrite each text in the site's plain style (root
  `CLAUDE.md` Website Documentation rules), keep the fix in the existing `fix` field, and keep facts only
  `detail` has today. Then delete `Detail` from `messages.go` (or move `Summary` there, whichever leaves one
  source), drop the field from both generators, and remove the "Full build message" box from
  `container/website/app/components/content/DiagnosticCatalog.vue` (the search index there reads `detail` too).
- About 120 codes have no summary yet, so this is a writing task as much as a code one. Fan it out per code
  family (VL, PJ, MKR, FMT, FT…); the generator already prints which codes still need a summary.

## Docs

`container/website/content/02.runtypes/08.diagnostics/02.all-diagnostics.md` renders the catalog through
`DiagnosticCatalog.vue`; the page text itself changes only if it mentions the "Full build message" box.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- The generated catalogs have `level` and no `severity`; `routing.test.ts` and the website still pass.
- Every code has exactly one plain-style text field, the "Full build message" box is gone, and no fact from the
  old `detail` text was lost.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source
  file, each committed on its own.

## Plan (approved 2026-09-28)

- `summary` and `detail` do the same job: both are read only by the website's All Diagnostics page
  (the devtools dictionary carried `detail`, but no code read it). They become ONE field, `summary`,
  in `prose.go`; `messages.go` keeps only the headline (`headlineByCode`, a plain code → string map).
- Drop `Definition.Detail`, drop `severity` and `detail` from the `gen-diag-catalog` dump and from both
  generated catalogs. A missing summary fails the generator and `TestEveryCodeHasSummary` (one line,
  no dash as punctuation).
- `DiagnosticCatalog.vue`: remove the "Full build message" box and `detail` from the search text.
- `routing.test.ts` derives severity from `level`.
- The 160 texts are written by fresh subagents following the simplify-docs skill, one per family
  group, to scratch JSON; merged into `prose.go`, checked against the old detail so no fact is lost,
  then reviewed again by the `docs-simplifier` pass. Code fixes from the old detail move into `Fix`.
