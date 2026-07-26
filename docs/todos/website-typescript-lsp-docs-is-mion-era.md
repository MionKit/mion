---
type: docs
spec: guidelines
status: ready
created: 2026-07-26
---

# `container/website/typescript-lsp-docs.md` is a mion-era scratch doc

## Origin

Found 2026-07-26 while implementing
[stale-docs-drift-cluster.md](../done/stale-docs-drift-cluster.md), during that
todo's verification grep for residual `mion` references under
`container/website/`. It is **not** one of that todo's ten findings, so it was
left alone and recorded here instead of silently widening the fix.

## Evidence

`container/website/typescript-lsp-docs.md` (269 lines) is investigation notes for
wiring the twoslash / LSP type-hover pipeline, written against **mion**, not
RunTypes. Every package it names belongs to the other project:

- `import {initClient} from '@mionjs/client'` (line 38)
- `import type {MyApi} from '@mionjs/examples/src/introduction/about-server.ts'` (line 59)
- `import {createRouter} from '@mionjs/router'` (line 155)
- virtual-FS entries for `@mionjs/router`, `@mionjs/server`, `@mionjs/client`
  `.d.ts` (lines 182-184, 227-230)
- "✅ Always import from `@mionjs/*`" (line 260)

`packages/examples/src/introduction/about-server.ts` does not exist in this repo,
and none of the `@mionjs/*` packages do. The file is not referenced by
`nuxt.config.ts`, `CONTAINER.md`, `CLAUDE.md`, or `AGENTS.md` — it sits loose in
`container/website/` with no inbound link.

Same class as findings 1 and 2 of the drift cluster (website files describing the
wrong project), which is why it turned up in the same grep. Those two were fixed
by that todo; this one was outside its stated scope.

## What to decide

Whether the twoslash / LSP notes still carry knowledge worth keeping.

- **If yes** — port them to RunTypes: rewrite the package names and the virtual-FS
  layout against what `server/api/twoslash.post.ts` and `server/utils/repo-root.ts`
  actually load today (first-party source + built `.d.ts` under `packages/`, plus
  the drizzle-orm allowlist), and link it from `container/website/CLAUDE.md` so it
  stops being an orphan.
- **If no** — delete it. It is unreferenced scratch work, and an unlinked file
  full of another project's imports is exactly the kind of thing that misdirects
  an agent grepping the website tree.

Read the file before choosing: the decision is whether its *content* (how twoslash
resolves types through a virtual file system) is still accurate for this repo's
pipeline, independent of the wrong package names on the surface.

## Done when

`container/website/` contains no file describing another project, and whatever
survives is reachable from `CLAUDE.md` or `CONTAINER.md`. Verify with
`grep -rni "mionjs" container/website/` returning nothing.

## Out of scope

The rest of `container/website/` — `CLAUDE.md`, `AGENTS.md`, `README.md`, and
`CONTAINER.md` were rewritten by the drift-cluster todo and are current.
