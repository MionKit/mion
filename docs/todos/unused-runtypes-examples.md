---
type: chore
spec: guidelines
status: ready
created: 2026-10-01
---

# Remove or Use the RunTypes Examples No Page Imports

## Intent

`packages/private-examples/src/` exists so website pages can `<code-import>` compiled examples. In
`packages/private-examples/src/run-types/`, 10 of the 12 files are imported by no page under
`container/website/content/`:

- `comparison-mion.ts`, `comparison-schema-first.ts`, `comparison-type-first.ts`, `comparison-typia.ts`
- `complete-example.ts`, `json-restore.ts`, `json-round-trip-union.ts`, `json-stringify.ts`
- `mock-data.ts`, `pure-functions.ts`

Only `validation-is-type.ts` and `validation-type-errors.ts` are used (by
`01.rpc/02.server/06.validation.md`). Dead examples still cost typecheck time and drift without anyone
noticing, since no reader sees them.

Repro:

```bash
for f in packages/private-examples/src/run-types/*.ts; do
  grep -rqF "${f#packages/}" container/website/content || echo "unused: $f"
done
```

## Direction

- Decide per file: delete it, or import it from the page it belongs to (some may duplicate a `guide/`
  example that a page already uses).
- A deleted file also leaves the lists that name it: `packages/private-examples/tsconfig.json`,
  `tsconfig.runtypes.json`, `eslint.config.js`, and `scripts/core/typecheck-coverage.mjs`
  (`comparison-typia.ts` has an entry there).
- Run the same sweep over the other `src/` subdirectories (`guide/`, `router/`, `_homepage/` ...), and
  consider a check (a `repo-contracts.test.ts` case, for instance) that fails on an example no page imports.
- The implementer plans the details.

## Docs

Only if a file moves onto a page: that page, in the section the example belongs to.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

Every file under `packages/private-examples/src/` is imported by a page (or listed as an intended
exception by whatever check guards it), `pnpm run typecheck` and the website link test pass, and the
simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
each committed on its own.
