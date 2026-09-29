---
type: fix
spec: guidelines
status: done
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
  deeper"), and each RUK code gets an `Example` and a `NestedExample` in `prose.go` (RUK013 has neither yet).

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

## Plan — decided rules (approved 2026-09-28)

Investigation on real code found the table above was incomplete; several rows were silent losses. The user
chose: keep the prototype copy for classes and refuse only what cannot work; refuse symbol-keyed properties
(checked against "just drop the key": the copy would break its own type); and a new build-time option
`sharedValues` instead of refusing shared values outright.

## What shipped

| Declared member | Before | Now |
| --- | --- | --- |
| symbol-keyed property `[tag]: string`, or a symbol-keyed method on an object type or interface (`[Symbol.iterator](): Iterator<T>`) | dropped, RUK013 Info | refused: RUK004 (RuntimeError, always throws). RUK013 retired. A symbol-keyed CLASS method stays on the prototype (RUK011). Consequence: with `@types/node` loaded, `{url: URL}` refuses on `URLSearchParams`' `[Symbol.iterator]` until the lib-types follow-up lands |
| `[k: symbol]: V` index signature | values silently dropped | every own enumerable symbol key copied with `V`'s rule (it declares them all). A named symbol property whose type is exactly `V` is copied by it; any other named symbol property refuses (RUK004), since `V`'s rule would drop its extra members |
| class with `#private` fields | copied without them, so methods reading `this.#x` threw | refused: RUK005 |
| class with only methods | `return {}`, prototype lost | `Object.create(proto)`, methods work |
| class with an index signature | built on `{}`, prototype lost | built on `Object.create(proto)` |
| class method, get / set accessor | method not copied (RUK011); a getter was assigned and threw | both stay on the prototype, RUK011 (message now "method or accessor") |
| function-typed class field (`fn = () => 1`) | read as a method and lost | copied, shared, RUK010 |
| function / Promise / RegExp / not-data built-in | shared with a warning at property positions only; RegExp, array / tuple / Map / Set elements, index-signature values and roots were shared silently or dropped | same rule everywhere: `sharedValues` absent shares with RUK010 / RUK015 (Warning), `'share'` shares with RUK016 (Info), `'refuse'` makes the factory always throw with RUK006 |
| function-typed root | callable interface threw RUK003, bare function passed through | both follow `sharedValues` like any shared value. RUK003 retired |
| function inside a union (`string \| (() => void)`) | dropped by the union layout: identity, no notice | follows `sharedValues` like any shared value |
| symbol VALUE | shared with RUK015 | copied as is (a primitive), no notice |
| static member | skipped, RUK012 | unchanged |

Also fixed on the same path, each with its own commit and tests:

- **Class `#private` fields were projected** under tsgo's internal name `\xFE#<id>@#x` in every family:
  validate required a key no instance has (always false) and the JSON encoder wrote it. The projection now skips
  them and flags the class `privateFields`; get / set accessors and function-typed fields are flagged too
  (`accessor`, `field`), and all three fold into the type id.
- **A nested always-throw type gave no build error at the outer call site** in any family (for example
  `createValidateFn<{inner: Inner}>()` with `Inner` holding a `symbol[]`). The outer site now reports the
  inner entry's root code (`reportReachedThrows` in `cachegen/typefunctions/module.go`).
- removeUnknownKeys no longer absorbs a nested compile failure by dropping the property: it always refuses.

`sharedValues` is compile-time: `removeUnknownKeysShared` (`ruks`) and `removeUnknownKeysRefuse` (`rukr`) are
their own families, swapped in by the scanner, and `overrideRemoveUnknownKeys<T>()` applies to all three.
The factory now takes `(value or RunType, options, id)` like the other option-carrying factories: the injected id
moved from the 2nd to the 3rd argument, and `RemoveUnknownKeysOptions` is a new export.

Diagnostics: RUK004, RUK005 and RUK006 are RuntimeError at any depth (`ScopeGraph`, with an `Example` and a
`NestedExample` each); RUK010, 011, 012, 015 and 016 carry both too. RUK001 stays a root code, so it has an
`Example` only (the catalog forbids a nested twin on a root code). An always-throw entry is never disk-cached, so a
warm build rebuilds it and still reports it at the outer call site.

Tests: Go `remove_unknown_keys_rules_test.go` (every rule at the root and one level deeper, in paired call shapes,
each `sharedValues` mode at every position), `nested_throw_report_test.go` (the outer-site report per family, paired,
plus a warm disk-cache rerun), `class_member_flags_test.go` (paired, plus a same-id check for both call shapes), and
the RUK examples and nested examples in `prose.go` through the real scan; JS `privateClassFields.test.ts`,
`removeUnknownKeysMembers.test.ts` (root and nested, both call shapes) and the override suite under both modes. Docs: the "Removing Unknown Keys" section of the validation guide.

Follow-ups filed while doing this: an audit for other diagnostics hidden on nested positions; standard types
that stop being "not data" when any other file (for example `@types/node`) redeclares them; `overrideValidate`
possibly skipped under `checkUnknowns` / `checkUnionUnknowns`; and giving the two option-less createX factories
the same three parameters as the rest.
