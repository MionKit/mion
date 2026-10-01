---
type: chore
spec: guidelines
status: ready
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
