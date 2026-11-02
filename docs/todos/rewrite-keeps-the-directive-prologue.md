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
