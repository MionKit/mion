---
type: feature
spec: guidelines
status: ready
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

The implementer settles the design. Three strands, in this order:

**Split the params.** Investigate separating a format's PURE constraints (what
makes a value valid) from its TRANSFORM metadata (what would be rewritten, and
when). Today both live in one params bag, so an author reading
`TF.String<{maxLength: 32, trim: true}>` gets no signal that one of those two
changes their data and the other does not. A separate slot — a nested
`transform` object, a distinct params type, whatever reads best — makes the
intent visible at the call site and gives the pipeline something to switch on.
It also settles the `email` / `domain` / `ip` / `url` question: make their
lowercasing a declared transform like everyone else's, with the migration that
implies.

**Decide where they run.** The natural seam is decode (a value arriving over the
wire is canonicalised before the handler sees it) and possibly encode on the way
out. The transform is its own compiled function today, so wiring it as a separate
step is cheap; folding it INTO `restoreFromJson` would be faster but changes what
that function means. Sanitising on the way IN and on the way OUT are also not
obviously the same decision.

**Give it a surface.** Likely an extra option on every `createX` factory that
serializes or deserializes a type, so a caller says once that this type's
transforms apply: the JSON encoder / decoder pair, `createBinaryEncoderFn` /
`createBinaryDecoderFn` (`packages/run-types/src/createRTFBinary.ts`), and
whatever mion's route options need to pass it through. Keep the existing
standalone `createFormatTransformFn` working for callers who want to run it by
hand.

Two constraints hold whatever is chosen:

- **Opt-in, not silent.** Rewriting a caller's data is a surprise, and mion
  routes are typed by their handler signature, so a consumer may not expect their
  input to change under them.
- **Both ends agree.** `@mionjs/client` serializes with the same compiled
  functions, so a rule that holds on one side and not the other means the two
  disagree about what the value is.

## Done when

- There is ONE way a format declares a transform, and a reader of a type can tell
  which of its metadata rewrites data.
- A route (and a direct `createX` caller) can ask for transforms to apply, and
  they do, at a documented point in the pipeline.
- `@mionjs/client` and the router treat the value the same way.
- Tests cover a transforming format end to end through a real route, not just
  `createFormatTransformFn` in isolation.
- The website says what runs, when, and how to turn it on; the existing
  `createFormatTransformFn` docs point at it.
- If part of this is deliberately cut (say, leaving the always-on lowercasing
  alone for now), the moved spec records why and the rest becomes its own todo.
