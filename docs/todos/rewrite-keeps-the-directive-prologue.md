---
type: fix
spec: guidelines
status: ready
created: 2026-11-02
---

# The source rewrite puts its imports above `"use client"` / `"use server"`

## Intent

Calling the mion client from a Next.js client component, the most natural usage, fails on both Turbopack and
webpack: the rewrite splices its import block at offset 0, above the directive, and Next rejects the file
(`The "use client" directive must be placed before other expressions`; same for a module-level `"use server"`).
Found while porting the mion-starters Next.js starter to 0.13.2; investigation in the mion-starters repo,
`docs/investigations/mion-0.13-migration/nextjs.md` issue 1, repros `repros/use-client-directive-page.tsx` and
`repros/use-server-directive-actions-direct.ts`.

## Direction

The implementer plans the fix. Verified pointers:

- Go: `ts-go-runtypes/internal/compiler/sourcerewrite/transform.go:55-57` (`editBuffer.prepend(importBlock)`).
- Edits mode (Turbopack, webpack, the loader path): `packages/devtools/src/core/apply-edits.ts:17`, contract at
  `sourcerewrite/edits.go:17-19`.
- Insert after the whole directive prologue (any string-literal directives, not only the two React ones) and after
  a `#!` line. Source maps must stay correct.
- Test both rewrite paths (full transform and edits), including the CLI `mion compile` output.

## Docs

None, because the rewrite is invisible to users once it keeps directives in place; no page documents the limitation.

## Done when

- A `"use client"` component and a `"use server"` module with mion call sites build and run under `next dev` and
  `next build` on both bundlers, pinned by tests on both rewrite paths.
- The simplify-comments pass ran on every touched source file, committed on its own.

## Plan: keep the prologue first (approved 2026-11-02)

Run in automatic mode from the parent session's delegation brief (no human in this background session).

- Go: `sourcerewrite.PrologueEnd(*ast.SourceFile)` returns the byte offset just past a `#!` line and the last
  leading string-literal directive (`ast.IsPrologueDirective`). `Apply` and `ComputeEdits` take that offset.
  The import block lands at the start of the next line when only spaces or comments follow the prologue on
  its line, else right after it with a leading newline. Offset 0 keeps today's `prepend`, byte for byte.
- Wire: `TransformResult.ImportAt` (UTF-16 offset, omitted when 0). `applyEdits` inserts the block there,
  before every other edit, mirroring `Apply`.
- Callers: resolver transform (both modes), declarations pass, fixture generator.
- Tests: Go fixtures for `"use client"`, `'use server'` + `"use strict"` pair, shebang, trailing comment,
  no newline; parity test `ComputeEdits` = `Apply`; `PrologueEnd` unit test on parsed files; JS `applyEdits`
  test; CLI `mion compile` test with a `"use client"` file. e2e: smoke-next gets a `"use client"` component and
  a `"use server"` module with call sites, built by Turbopack and by `next build --webpack`, ids asserted in the
  prerendered HTML.
- Docs: none (spec says so). Fuzzing: not a feature.
