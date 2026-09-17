---
type: fix
spec: guidelines
status: done
created: 2026-09-17
---

# A registerFormatPattern value raised CTA003, and it is the documented spelling

## What was wrong

`registerFormatPattern` exists so a pattern can be bound to a const once and reused across
fields. That spelling raised `CTA003` ("`CompTimeArgs<T>` literal contains a forbidden
construct (function call)"), because tracing the const initializer reached a call:

```ts
const hexPattern = registerFormatPattern({source: '^[0-9a-f]+$', flags: 'i', mockSamples: ['DEADbeef']});
const RegexModel = RT.object({
  slug: TF.string({pattern: {source: '^[a-z0-9-]+$', flags: '', mockSamples: ['ok-slug']}}), // inline, fine
  hex: TF.string({pattern: hexPattern}), // registerFormatPattern value -> CTA003
});
```

The finding was wrong. The scanner recovers `{source, flags, …}` from the property's resolved
TYPE, not from the value, so nothing was lost by the value being unreadable and the pattern
compiled correctly. `CTA003` is `LevelRuntimeError`, so on a strict build a consumer writing the
documented spelling got a halted build for code that works.

## What shipped

The rule is judged on the call's RETURN TYPE, next to the existing builder-leaf rule, so no
callee name is involved and a helper added later is covered for free.

`comptimeargs.IsTypeReadableValue` answers whether a type can be read WHOLE off the type alone:
a literal leaf, `undefined` / `null`, a tuple of readable elements, or an object whose every
property is readable. `builders.IsMarkerPackageType` is the name-free twin of `IsRunType`, and
`builders.CallReturnType` exposes the return type `IsBuilderLeafCall` already resolved. The
resolver's leaf predicate combines them:

```go
if builders.IsBuilderLeafCall(state.scanChecker, node, markerOpts) {
	return true
}
returnType := builders.CallReturnType(state.scanChecker, node)
return builders.IsMarkerPackageType(returnType, markerOpts) &&
	comptimeargs.IsTypeReadableValue(state.scanChecker, returnType)
```

Two guards keep the acceptance honest, both pinned by tests:

- A widened bundle (`FormatPattern` with `source: string`) carries nothing the scanner can read,
  so it stays a `CTA003` rather than silently losing the pattern.
- A user module's own all-literal bundle looks identical at the type level but nothing reads it
  off the type, so dynamic construction stays rejected.

The other `register*` helpers were checked and none has this shape: `registerPureFn` and
`registerClassSerializer` take a `CompTimeArgs` id rather than returning a value bundle, and
`registerMockingFunction` returns nothing.

## Tests

`ts-go-runtypes/internal/compiler/resolver/comptimeargs_formatpattern_test.go`, three cases
against the REAL marker package: both pattern spellings side by side raise nothing (this one
fails without the fix, with two `CTA003`s), a widened `FormatPattern` still raises `CTA003`, and
a user-module bundle call still raises `CTA003`. No `getRunTypeId` call site is involved, so the
marker coverage rule does not apply.

`packages/run-types/test/suites/value-first-define/` now reports no finding for the
`registerFormatPattern` field and its 38 tests still pass, which is the check that the pattern
still compiles. No `@mion-expect-error CTA003` comment existed on `main`, so there was none to
delete.

## Docs

`packages/examples/src/guide/custom-format-pattern.ts` now also shows the builder spelling
(passing the registered value straight into `TF.string({pattern: sku})`), and the Pure Functions
and Type Formats guide pages say a registered pattern fits both authoring styles.
