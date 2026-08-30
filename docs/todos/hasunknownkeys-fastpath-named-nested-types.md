---
type: fix
spec: guidelines
status: ready
created: 2026-08-30
---

# runsAfterValidation fast path is lost at named nested object types

## Intent

`createHasUnknownKeysFn<T>(undefined, {runsAfterValidation: true})` promises, in its own doc comment,
that "all-required object nodes replace the O(props x keys) key-array scan with a key-count compare
(`countEnumKeys(v) !== N`)" — measured ~3x on a 7-prop shape and ~44x at 30 props.

It only delivers that at nodes that end up INSIDE the root body. A NAMED nested type (a type alias
or an interface used as a property) is emitted as a separate entry and dep-called, and that call
resolves to the PLAIN `huk` entry, which has no fast path. So the common real-world shape, where
people name their nested types, silently keeps the slow scan.

Results stay correct. It is the documented contract and the advertised speedup that are wrong, which
is why this is a `fix` rather than a perf idea.

## Evidence

Three facts in the current tree, all verified:

1. **Variant options are root-scoped.** `renderEntryWithDeps` sets the walker's `InnerPrefix` to the
   PLAIN family hash even for a variant walker
   ([module.go:483](../../ts-go-runtypes/internal/cachegen/typefunctions/module.go)); its comment
   says so outright: "the variant only changes the ROOT body, not its children".

2. **A named child goes external.** `DefaultIsRTInlined` returns `ctx.RT.TypeName == ""` for object
   literals, arrays, tuples and unions
   ([inlining.go:93-96](../../ts-go-runtypes/internal/cachegen/typefunctions/inlining.go)), so an
   unnamed inline `{street: string}` inlines and a named `type Address = {...}` does not. The
   dispatch gate is `walker.go:753`:

   ```go
   shouldDepend := overrideChild || ((!w.Emitter.IsRTInlined(&w.inlineCtx) || w.inlineWouldCycle(rt.ID)) && len(w.Stack) > 1)
   ```

3. **The dep call targets the plain entry.** `childID := w.InnerPrefix + rt.ID` (walker.go:798), and
   per (1) `InnerPrefix` is the plain hash, so the emitted call is `huk_<Address>.fn(...)` — the
   entry rendered with no variant options, which takes the
   `callCheckUnknownPropertiesForHas(rt, ctx, false, true)` branch in `emitInterfaceHasUnknownKeys`
   ([unknownkeys_has.go:141](../../ts-go-runtypes/internal/cachegen/typefunctions/unknownkeys_has.go)).

So: inline nested object → fast path. Named nested object → full scan.

## Repro

Compile two shapes whose only difference is whether the nested type is named, both with
`{runsAfterValidation: true}`, and compare the emitted `huk` bodies:

```ts
type Inner = {a: string; b: string};
type Named = {inner: Inner};
type Inline = {inner: {a: string; b: string}};
```

`Inline`'s emitted body should carry the key-count compare at the nested node; `Named`'s should show
a dep call to the plain `huk_<Inner>` entry running the key-array scan. A Go-level emit test in
`ts-go-runtypes/internal/cachegen/typefunctions/` is the cheapest way to pin it.

## Direction

The implementer plans this; two routes are visible and they are not equal:

- **Propagate the variant to children.** Make `runsAfterValidation` a graph-propagating option: the
  variant walker's `InnerPrefix` becomes the variant hash and the collector renders children under
  the same suffix. Correct, but note the blocker: **no variant entry is disk-cached** — both the read
  (module.go:461) and the write (module.go:671) are gated on `variantSuffix == "" && !rejectCircular`
  — so this would re-render the whole subtree on every build. Measure that cost before committing to
  it.
- **Make it a family instead of a variant.** Families recurse into children naturally, disk-cache
  under `<typeID>/<tag>.json`, and honour overrides. More surface to add (a `CacheModules` row, an
  `entryTuple.ts` `familyMeta` row, a noop fact lane), but none of the variant limits.

Whichever route wins, the same question is being answered by
[docs/todos/fused-multi-family-traverser.md](fused-multi-family-traverser.md), which lands a
multi-family traverser and concludes that fused output should be families rather than variants.
Worth reading that doc's phase 1 findings first: if it has already landed, this fix may reduce to
reusing its machinery. The two are independent enough to build separately, but the second one to
land should reuse the first's answer rather than inventing a second one.

Also fix the claim in the doc comment on `HasUnknownKeysCompileOptions`
([createRTFunctions.ts](../../packages/ts-runtypes/src/createRTFunctions.ts)) and any website copy
that repeats the speedup, so the text matches whatever the code ends up doing.

## Done when

A named nested all-required object gets the same key-count compare an inline one does, pinned by a
Go emit test over the two shapes above; the measured speedup is re-checked (the ~3x / ~44x numbers
in the doc comment are either confirmed or corrected); the `runsAfterValidation` doc comment and any
website copy match the real behaviour; `pnpm test` and
`go -C ts-go-runtypes test ./internal/...` green.
