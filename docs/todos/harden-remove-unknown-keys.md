---
type: fix
spec: guidelines
status: ready
created: 2026-09-28
---

# Harden `removeUnknownKeys`: never return a copy that is missing a declared member

## Intent

`createRemoveUnknownKeysFn<T>()` returns `(value: T) => T` (`packages/run-types/src/createRTFunctions.ts`). The
output type is the full `T`, not `DataOnly<T>`. The JSON and compact decoders may drop non-data members only
because they return `DataOnly<T>`, which drops those members from the type too. `removeUnknownKeys` has no such
excuse: every member `T` declares must be on the copy and must work, or the factory must refuse (build error
plus a function that always throws, like VL002).

This is an investigation first: confirm each case below on real code, then pick the rule per case and fix it.

## What it does today

Emitter: `ts-go-runtypes/internal/cachegen/typefunctions/remove_unknown_keys.go`. Levels:
`ts-go-runtypes/internal/diagnostics/codes_runtype.go`.

| Declared member | What the copy gets | Code, level |
|---|---|---|
| function property | kept, the same function shared with the input | RUK010, Warning |
| Promise, symbol value, other value it cannot rebuild | kept, shared with the input | RUK015, Warning |
| class method | not copied; the copy keeps the input's prototype, so it still works | RUK011, Info |
| static member | skipped (lives on the class) | RUK012, Info |
| symbol-keyed property `[tag]: string` | dropped, the value is lost | RUK013, Info |

A class root is copied with `Object.create(Object.getPrototypeOf(v))` (`buildClassRemoveUnknownKeys`): the
prototype comes from the input, and the constructor never runs.

## Direction (maintainer's view, to confirm)

- **Symbol-keyed member: refuse.** The generated code cannot name a user's symbol, so it cannot copy the member
  safely. Make it an always-throw factory with a build-time RuntimeError, replacing RUK013. Check the other
  option first (copy every own symbol property of the input, shared) and say why it was rejected or kept: it
  cannot tell a declared symbol from an undeclared one.
- **Class root: decide if cloning a class is safe at all.** Skipping the constructor loses `#private` fields and
  anything the constructor sets up, so a method that reads `this.#x` throws on the copy. Options: refuse for
  classes (always throw), or refuse only for classes with private fields / a constructor that does work, or keep
  today's prototype copy. Test each with a real class.
- **Class method (RUK011).** Works through the prototype today. Confirm it still holds once the class-root rule
  above is chosen, and check a method stored as an own property (arrow-function field `fn = () => ...`).
- **Shared values (RUK010, RUK015).** Decide whether sharing a function / Promise with the input is acceptable
  for a function whose output type is `T`, or should also refuse.
- Every case gets a test at the root and one level deeper (`ts-go-runtypes/CLAUDE.md`, "same test, one level
  deeper").

## Docs

`container/website/content/02.runtypes/` pages for `removeUnknownKeys` and the diagnostic catalog: say what
the function refuses and why. Run the simplify-docs pass (the `docs-simplifier` subagent) over every touched
page and commit it on its own.

## Done when

- Each row of the table has a decided rule, written in the emitter's comments and on the website.
- No declared member is silently missing from a copy: it is copied, shared with a Warning, or the factory
  refuses with a RuntimeError.
- Tests on the real path (Go emitter tests and a `packages/run-types` feature test) cover each rule, root and
  nested.
- The simplify-comments pass ran on every touched source file, committed on its own.
