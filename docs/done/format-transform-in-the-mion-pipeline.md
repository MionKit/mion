---
type: feature
spec: guidelines
status: done
created: 2026-09-01
---

# Standardise how format transforms are declared and where they run

## Intent

A type can declare a value rewrite (`TF.Lowercase`, `TF.String<{trim: true}>`,
`TF.Email` lowercasing, `TF.CreditCard<{stripSeparators: true}>`), and RunTypes
compiles it. Nothing in mion ever applies it.

So a route declaring `email: TF.Email` receives `John@Example.COM` exactly as
sent. The type says the value is case-insensitive and the build knows how to
canonicalise it, but the handler still gets the raw string, and every handler
has to remember to normalise by hand. That is the kind of thing a typed
framework is supposed to take care of.

There is no way to ask for it either: no route option, no plugin flag. The only
door is calling `createFormatTransformFn<T>()` yourself, outside the pipeline.

Underneath that is a second problem, and it has to be settled first: there is no
single answer to "how is a transform declared", so there is nothing consistent
for a pipeline to switch on.

## The two problems

### 1. Transforms are declared two different ways

**Param-driven** — the `stringFormat` family, where the transform is a keyword
the author writes in the type (`packages/run-types/src/formats/string/stringFormats.ts:136`):

```ts
// "Transformer flags — applied only by the `createFormatTransformFn<T>`
//  RT-fn, NOT by validate / validationErrors validation."
trim?: boolean;
lowercase?: boolean;
uppercase?: boolean;
capitalize?: boolean;
replace?: {searchValue: string; replaceValue: string};
replaceAll?: {searchValue: string; replaceValue: string};
```

**Baked into the format** — `email`, `domain`, `ip` and `url` lowercase with no
param at all. The emitters do not even read the annotation:

```go
// ts-go-runtypes/internal/cachegen/typefunctions/formats/string/ip.go:84
func (ipEmitter) EmitFormatTransform(_ *reflection.FormatAnnotation, vλl string, _ formats.EmitContext) string {
	return vλl + ".toLowerCase()"
}
```

(`domain.go:56`, `url.go:29`, `email.go:154` are identical. The `_` on the
annotation is the proof.) Nothing in `TF.Email` says "lowercase me" — it is part
of what the format IS, so an author cannot see it in the type and cannot opt out.

`creditCard` is param-driven (`stripSeparators`), because accepting a grouped
number and rewriting it turned out to be two different decisions.

That inconsistency is the blocker. Turning transforms on globally today would
silently start lowercasing every email, domain, ip and url route, with nothing in
those types to turn it off.

### 2. Nothing in the pipeline runs them

- `formatTransform` is a real, public rt-fn family:
  `ts-go-runtypes/internal/cachegen/operations/operations.go:144`
  (`Public: true`), dispatched at
  `internal/compiler/resolver/dispatch.go:79`. The compiled function exists.
- The mion adapter never asks for it. The per-route function set in
  `packages/core/src/types/general.types.ts:130-140` carries `isType`,
  `typeErrors`, `prepareForJson`, `restoreFromJson`, `stringifyJson`,
  `hasUnknownKeys`, `unknownKeyErrors`, `toBinary`, `fromBinary` — and no
  transform. `packages/core/src/runtypes/mionAdapter.ts:223` resolves each one by
  key; there is no key to resolve here.
- A grep across `core`, `router`, `client` and `devtools` finds no caller of
  `createFormatTransformFn` at all. It is exported from
  `packages/run-types/src/index.ts:212` and used only by consumers directly.

## Direction

**The API is the task, and it is open.** Everything above is verified fact about
the current state; none of it is a design. Work out an elegant, unified shape and
agree it with the user BEFORE building — do not pick one from this doc.

The questions it has to answer:

- **How is a transform declared?** Today a format's pure constraints (what makes
  a value valid) and its transform metadata (what would be rewritten) share one
  params bag, so an author reading `TF.String<{maxLength: 32, trim: true}>` gets
  no signal that one of those changes their data and the other does not. Worth
  investigating whether the two should be separate, and what that does for the
  `email` / `domain` / `ip` / `url` lowercasing that is declared nowhere at all.
- **Where does it run?** Decode is the obvious candidate, encode maybe. Sanitising
  on the way in and on the way out may not be the same decision.
- **How does a caller ask for it?** Some surface on the factories that serialize
  and deserialize a type, and something mion's routes can pass through. The
  standalone `createFormatTransformFn` should keep working for callers who run it
  by hand.
- **What happens to the always-on lowercasing?** Whatever is chosen changes
  behaviour for every existing route using those four formats. That migration is
  part of the design, not an afterthought.

Two constraints hold whatever is chosen:

- **Opt-in, not silent.** Rewriting a caller's data is a surprise, and mion routes
  are typed by their handler signature, so a consumer may not expect their input
  to change under them.
- **Both ends agree.** `@mionjs/client` serializes with the same compiled
  functions, so a rule that holds on one side and not the other means the two
  disagree about what the value is.

## Done when

- The API was agreed with the user before any code was written.
- There is ONE way a format declares a transform, and a reader of a type can tell
  which of its metadata rewrites data.
- A route (and a direct caller) can ask for transforms to apply, and they do, at
  a documented point in the pipeline.
- `@mionjs/client` and the router treat the value the same way.
- Tests cover a transforming format end to end through a real route, not just
  `createFormatTransformFn` in isolation.
- The website says what runs, when, and how to turn it on; the existing
  `createFormatTransformFn` docs point at it.
- If part of this is deliberately cut (say, leaving the always-on lowercasing
  alone for now), the moved spec records why and the rest becomes its own todo.

## Plan, approved 2026-09-01

Agreed with the user before any code was written.

- **One representation, two spellings.** A format declares its rewrite under ONE nested
  `transform` key in its params. It can be written as a nested param
  (`TF.Email<{transform: {trim: true; lowercase: true}}>`) or through the wrapper type
  `TF.Transform<TF.Email, {trim: true; lowercase: true}>`; both resolve to the same structural
  id. `TF.Transform<string, P>` is `TF.String<{transform: P}>`. Value-first twin:
  `TF.transform(TF.email(), {...})`. The flat `trim` / `lowercase` / `uppercase` /
  `capitalize` / `replace` / `replaceAll` flags and `CreditCard`'s top-level `stripSeparators`
  are removed (breaking, pre-1.0). The `Lowercase` / `Uppercase` / `Capitalize` presets stay.
- **Email / Domain / IP / Url stop lowercasing by default.** Opt in with
  `transform: {lowercase: true}`. Validation already accepted any case, so only
  `createFormatTransformFn` output and mock data change.
- **mion runs it as "sanitize".** `sanitizeParams?: boolean` on router options and on
  route / middleFn / headersFn options (route ?? router, default off). Server order:
  decode, sanitize, validate, handler. Params only: never headers, never return values. The
  resolved flag rides the methods metadata like `strictTypes`. Client option `sanitizeParams`
  (default true) runs the same compiled fn locally before pre-validation and serialization, for
  routes whose server flag is on, so both ends validate and send the same value.
- **No transform runs inside validate / parse / encode / decode.** `createFormatTransformFn`
  stays the direct-caller surface. A `{transform: true}` option on `createParseFn` was
  discussed and discarded, not deferred.
- **Tests.** Both marker shapes; the two spellings converge on one id; validate / parse /
  decoder / encoder leave a mixed-case value untouched; end-to-end router and client tests
  through real routes (JSON and binary bodies, per-route overrides, wrong-shaped input still a
  validation error); Go emitter tests; an idempotence fuzz (transform twice equals once) on the
  existing `unit` lane, since both ends apply the same transform.
- **Docs.** runtypes site: a Transforms section in type formats, mocking and friendly-type
  notes. mion site: a Sanitize params section in validation, a routes pointer, the client option.

## As built (2026-09-01)

Everything in the approved plan shipped, with two things the tests changed along the way.

- **Declaration.** `StringTransformParams` / `CreditCardTransformParams` /
  `TransformParamsByFormat` / `TransformParamsOf<T>` and the `Transform<T, P>` wrapper live in
  `packages/run-types/src/formats/string/stringFormats.ts`, with the value-first `TF.transform()`
  builder and `FormatBrandNameOf<T>` in `runtypes/typeFormat.ts`. Every string-family params
  bag (String, Email, Domain, IP, Url, CreditCard) takes `transform?`; the flat flags and the
  top-level `stripSeparators` are gone. The presets `Lowercase` / `Uppercase` / `Capitalize`
  bake `{transform: {...}}` and pin the key.
- **Go.** One shared reader, `formats.EmitStringTransform` / `ValidateTransformParams` in
  `ts-go-runtypes/internal/cachegen/typefunctions/formats/transform.go`; the six string
  emitters go through it, and `email` / `domain` / `url` / `ip` no longer lowercase on their
  own. The `transform` block is an FMT002 error when it carries an unknown key, a non-boolean
  flag or a half-written replace (the TS exact-params check is shallow, so this is the only
  guard). The pure-fn params literal drops the block. `schemadoc` and `enrich` list `transform`
  instead of the six flat keys.
- **mion.** `fmt` is the last key on every PARAMS marker (never on a return marker), exposed as
  `paramsJitFns.formatTransform` only when the entry is live. `sanitizeParams` on router and
  route / middleFn / headersFn options, resolved `route ?? router` at registration and shipped
  in the metadata. Server: `sanitizeParams()` in `packages/router/src/dispatch.ts` runs between
  decode and validation, for JSON and binary bodies, headers untouched, a throwing transform
  falls through to validation. Client: `packages/client/src/lib/sanitize.ts`, called after the
  metadata fetch in `makeCall`, `validateParams` and `prefill`, guarded by a WeakSet on the
  params array so one request never runs a transform twice; `ClientOptions.sanitizeParams`
  defaults to true.
- **Tests.** Both marker shapes throughout. `format-transform/StringFormat.ts` (both spellings,
  the four named formats identity-by-default and opt-in, the brand kept, the value-first twin),
  `features/transformSpellings.test.ts` (id convergence), `features/transformIsolation.test.ts`
  (validate / parse / decoder / encoder never rewrite), Go emitter and shape-check tests,
  `core` adapter, `router/dispatch.spec.ts` (global, default off, per-route both ways, binary
  body, wrong shape, headersFn, return untouched), `client/lib/sanitize.spec.ts` against the
  test server's `sanitizeEmail` / `rawEmail` routes.
- **Fuzz, and what it found.** `test/fuzz/type/transformIdempotence.test.ts`: thousands of
  generated strings (with tabs, newlines, a non-breaking space, the sharp s, a surrogate pair)
  through every compiled transform, alone, chained and nested, asserting transform(transform(x))
  equals transform(x). It runs under the package config rather than the `unit` lane because
  it needs the compiled functions. It caught a real ordering bug: trim ran BEFORE the
  replacements and the separator strip, so stripping a leading `-` could expose a non-breaking
  space that only the second pass trimmed. The chain is now replace, replaceAll, strip, trim,
  then the case change, and the docs say so. It also pinned the one chain that cannot be
  stable: lowercase then capitalize on a letter whose uppercase is two letters (`ß` gives
  `SS`, then `ss`, then `Ss`), documented as such. `replace` (first match) is pinned as NOT
  idempotent, with the docs steering a sanitized route to `replaceAll`.
- **Docs.** runtypes site: a Transforms section in the type formats guide (both spellings,
  the order, "never inside validate / parse / decode / encode", the move of the flat keys),
  the mocking and friendly-type notes. mion site: a Sanitize params section in Validation, a
  pointer in Routes, the client option in the client overview. Four new example files under
  `packages/examples/src/`.
- **Budgets.** The optional `transform` key costs the string preset builders three to five TS
  instantiations per first call; the five affected budgets in
  `test/types/builderCost.compile.test.ts` moved by exactly that.

Cut, by decision, not deferred: a `{transform: true}` option on `createParseFn` /
`createJsonDecoderFn`. `createFormatTransformFn` is the direct-caller surface and mion's
`sanitizeParams` is the pipeline one. No follow-up todo.
