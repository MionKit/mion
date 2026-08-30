---
type: feature
spec: guidelines
status: ready
created: 2026-08-30
---

# Which standard-library globals should become data-only

## Intent

The projection now decides data by what IS data. A type declared in the bundled standard library
is not on that list, so it is taken whole and dropped, whatever it is called. See
[docs/done/consumer-lib-version-contract.md](../done/consumer-lib-version-contract.md).

That closed the silent-divergence problem, and it deliberately left the supported set exactly
where it was: `Date`, `RegExp`, `Map`, `Set` and the Temporal types. The point of a closed
contract is that the set can now GROW deliberately, one reviewed type at a time, instead of a
type sneaking in because nobody put its name on a blocklist.

Some of what is currently dropped is obviously data. `URL` is the clearest: it is a string. A
consumer with a `URL` field gets a build warning and has to hand-convert, which is the right
default but a poor final answer for a type this common.

This todo is the review pass that decides which ones join, and says why for each.

## Direction

Work out a shortlist and, for every candidate, answer three questions:

1. **What does it serialise to?** The concrete JSON shape, not a hand-wave. `URL` is a string.
2. **Is the round trip exact?** `decode(encode(x))` must equal `x` by the type's own notion of
   equality. Say plainly where it is not: `new URL(href).href` normalises, so the URL value round
   trips but the original source text may not.
3. **Can both projections agree?** Go's `serialize.go` and the TypeScript `DataOnly<T>` twin have
   to say the same thing, and `DataOnly<T>` cannot ask where a type was declared. Whatever is
   added has to be nameable or shape-testable on both sides, the way `Date` and the
   `ArrayBufferView` member test already are.

A useful starting signal, and where the shortlist should come from: the platform already marks the
types it thinks have a JSON form, with a `toJSON` method. Scanning the bundled lib for interfaces
declaring one gives 27 names, `Date` and `URL` among them. Most are not model types
(`PerformanceEntry`, `RTCIceCandidate`, `PaymentResponse`); a few plausibly are
(`DOMRectReadOnly`, `DOMPointReadOnly`, `GeolocationCoordinates`).

Worth considering alongside them, even though they declare no `toJSON`:

- `URLSearchParams`, a string, or `Record<string, string[]>`.
- `Headers`, a `Record<string, string>`. Note the `Set-Cookie` multi-value wrinkle.
- `Error` and its subclasses, `{name, message}` plus optional `stack` / `cause`. Check against
  what `@mionjs/core` already does with `RpcError` / `TypedError` before adding anything, since
  the framework has its own answer here and two answers would be worse than one.

Deliberately NOT in this todo: the binary family. That has its own, see
[binary-as-opt-in-data.md](binary-as-opt-in-data.md).

Also worth deciding once, as policy rather than per type: whether a supported lib type needs an
explicit opt-in like the binary one will, or whether an exact round trip is enough to make it
data by default. `Date` and `Map` set the precedent for "by default".

The implementer plans the details: which types make the cut, in what order, how each is
recognised on both sides, and whether they land as one change or several.

## Done when

There is a reviewed list, with the three answers written down for each candidate, and a decision
per type: supported, refused, or deferred with a reason. Whether any of them are then implemented
in the same change is the implementer's call to propose.
