---
type: feature
spec: guidelines
status: ready
created: 2026-09-27
---

# A small mion + drizzle reference app, to find the holes

## Intent

The slim drizzle packages exist to cut type-checking cost: a table's types travel through the app without
drizzle's generics. They are proven against drizzle's own test suites and the basic models
(`InferSelectModel`, `InferInsertModel`, `InferUpdateModel`), but nobody has built a real app with them. Build
one, small but complete, and use it to find where the integration is weak or forces the user to write types
by hand.

The first known question: `toDrizzle` drops plain format tags from drizzle's query row types on purpose
(`PlainDataOf` in `packages/drizzle-orm/src/types.ts`, used by each dialect's `src/drizzle.ts`), keeping only
nominal brands. A route that returns a query result therefore returns a type without its formats, and the
client and the validators need them. We probably want format info kept, or recoverable from a drizzle return
type, without the user restating the type.

## Direction

The implementer plans the details. What to cover:

- **Home:** a new private package, e.g. `packages/private-drizzle-app/`, run by the normal test suite and the
  root typecheck like `packages/private-test-server/`. It needs its own vitest project, a test batch
  (`scripts/core/test-batches.mjs`) and a `typecheck:test` script.
- **The full path, for every case:** declare the table, query it, return the result from a mion route, call
  it from `@mionjs/client`, and validate it. Check the types at each step and what the client receives.
- **Queries beyond the basic models:** partial selects, joins, aggregates, `returning()`, relations
  (`db.query...`), a view with explicit columns and one built from a query builder (the second stays drizzle,
  see DRZ001), transactions, and a route that returns a mapped or nested shape.
- **Both table forms:** builder tables and tables written as types (`tableFromType`), at least pg; mysql and
  sqlite where the behaviour differs.
- **For each case, record:**
  - whether the returned type keeps its formats, or which it loses;
  - whether the user had to write a type by hand to keep the cost low, or to get formats back;
  - the type-instantiation cost of the file (measure with the type-budget harness,
    `packages/private-type-budget/test/`), next to the same code on plain drizzle.
- **Format loss is the first design question.** Weigh: keep format tags in `toDrizzle`'s row types (and what
  that costs, and whether a migrated schema stays a drop-in); or give a cheap way to recover formats from a
  drizzle return type. Decide with numbers.
- **Every hole found is fixed** in the same PR or split into its own todo; the findings list goes in the done
  spec.
- Related: the todo that adds a lint rule warning when a route returns a drizzle type. Its outcome may depend
  on what this one decides about formats.

## Docs

`container/website/content/01.rpc/04.drizzle-orm/00.drizzle-overview.md`: a new section on returning query
results from a route (what keeps its formats, and the recommended way), plus a line in `02.views.md` if view
rows behave differently. Examples in `packages/private-examples/src/drizzle/`.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- The app exists, runs in the normal test suite, and covers every case above end to end.
- Each case has a recorded result (formats kept or lost, hand-written types needed, type cost vs plain
  drizzle), kept in the done spec.
- The format-loss question is decided and implemented, with tests on both table forms.
- Every hole found is fixed or filed as its own todo.
- Docs updated; the simplify-docs pass ran on every touched page and the simplify-comments pass on every
  touched source file, each committed on its own.
