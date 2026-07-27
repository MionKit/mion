# Website `<code-import>` blocks point at 13 files that do not exist

**Status:** todo
**Created:** 2026-07-27 (found while sweeping the stale package references — see
[../done/website-stale-package-references.md](../done/website-stale-package-references.md))

**Pre-existing, not caused by that sweep.** Verified against `origin/main`: none of the target
files exist there either, so these `<code-import>` blocks have been dangling on `main`.

## Evidence

Scanned all 183 `<code-import path="…">` blocks under `website/content/`; **13 resolve to a
missing file**:

| Page | Missing target | Blocks |
| --- | --- | --- |
| `3.client/1.error-handling.md` | `packages/client/src/typedEvent.ts` | 1 |
| `3.client/2.validation-errors.md` | `packages/examples/src/client/friendly-errors-map.ts` | 2 |
| `3.client/2.validation-errors.md` | `packages/examples/src/client/friendly-errors-client.ts` | 1 |
| `3.client/2.validation-errors.md` | `packages/examples/src/client/friendly-errors-server.ts` | 1 |
| `3.client/2.validation-errors.md` | `packages/examples/src/client/friendly-errors-others.ts` | 3 |
| `3.client/2.validation-errors.md` | `packages/examples/src/client/friendly-errors-advanced-map.ts` | 5 |

Twelve of the thirteen are on the friendly-errors page. Some of those example files were added at
one point (`f992f87` touches `friendly-errors-{advanced-client,advanced-map,client,map}.ts`) but
they are absent from `main`, so they were either created on a branch that never landed or removed
later without updating the page.

`packages/client/src/typedEvent.ts` is a separate case: the page imports it from the **client
package source**, not from `packages/examples/`.

## Why it matters

A `<code-import>` that cannot resolve renders as an empty or failed block, so the two most
example-heavy client pages ship with holes. It also defeats the point of `<code-import>`: the
mechanism exists so examples are compiled real files rather than rotting inline snippets, and a
dangling path silently gives up that guarantee.

## Fix plan

1. Decide per block whether the example should be **restored** (write the missing file under
   `packages/examples/src/client/`, compiled like every other example) or the **page rewritten**
   to stop referencing it. The friendly-errors content itself already shipped
   ([friendlyerrors-to-friendlytext-feasibility.md](../done/friendlyerrors-to-friendlytext-feasibility.md)),
   so the page text is current — it is only the code blocks that are missing.
2. For `typedEvent.ts`, check whether the symbol moved or the file was renamed in the client
   package, and repoint rather than recreate.
3. **Add a CI check.** A dangling `<code-import>` should fail the build, exactly like the examples
   typecheck lane proposed in [examples-precompile-debt.md](examples-precompile-debt.md). A ~20-line
   script (walk `website/content/**/*.md`, assert every `path="…"` exists) would have caught this
   at the commit that introduced it. Worth wiring even before the deeper typecheck gate lands,
   since it is far cheaper.

## Acceptance

- Every `<code-import path="…">` under `website/content/` resolves to a file on disk.
- CI fails if a future one does not.
