---
type: feature
spec: guidelines
status: ready
created: 2026-09-01
---

# A format's value transform never runs in the mion pipeline

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

## Direction

The implementer settles the design. Verified pointers:

- `formatTransform` is a real, public rt-fn family:
  `ts-go-runtypes/internal/cachegen/operations/operations.go:144`
  (`Public: true`), dispatched at
  `internal/compiler/resolver/dispatch.go:79`. The compiled function exists.
- The mion adapter never asks for it. The per-route function set in
  `packages/core/src/types/general.types.ts:130-140` carries `isType`,
  `typeErrors`, `prepareForJson`, `restoreFromJson`, `stringifyJson`,
  `hasUnknownKeys`, `unknownKeyErrors`, `toBinary`, `fromBinary` — and no
  transform. `packages/core/src/runtypes/mionAdapter.ts:223` resolves each one
  by key; there is no key to resolve here.
- A grep across `core`, `router`, `client` and `devtools` finds no caller of
  `createFormatTransformFn` at all. It is exported from
  `packages/run-types/src/index.ts:212` and used only by consumers directly.
- Six formats declare a transform today, so this is not a credit-card question:
  `stringFormat` (trim / lowercase / uppercase / capitalize / replace /
  replaceAll, each its own param), `email` / `domain` / `ip` / `url` (lowercase,
  always, no param), and `creditCard` (`stripSeparators`).

The open questions, in the order they need answering:

- **Where does it run?** The natural seam is decode (a value arriving over the
  wire is canonicalised before the handler sees it) and possibly encode on the
  way out. Note the transform is its own compiled function today, so wiring it
  as a separate step is cheap; folding it INTO `restoreFromJson` would be
  faster but changes what that function means.
- **Is it opt-in?** Silently rewriting a caller's data is a surprise, and mion
  routes are typed by their handler signature, so a consumer may not expect
  their input to change. A route or plugin flag is probably needed rather than
  making it unconditional.
- **What about the always-on lowercasing?** `email` / `domain` / `ip` / `url`
  transform with no param at all, so turning this on would change behaviour for
  every existing route using them. That is the migration question, and it may
  argue for making those param-driven first.
- **The client side** (`@mionjs/client`) serializes with the same compiled
  functions, so whatever is decided has to hold at both ends or the two
  disagree about what the value is.

## Done when

- A route can declare that its formats' transforms apply, and they do, at a
  documented point in the pipeline.
- Both ends agree: `@mionjs/client` and the router treat the value the same way.
- Tests cover a transforming format end to end through a real route, not just
  `createFormatTransformFn` in isolation.
- The website says what runs, when, and how to turn it on; the existing
  `createFormatTransformFn` docs point at it.
- If part of this is deliberately cut (say, leaving the always-on lowercasing
  alone), the moved spec records why and the rest becomes its own todo.
