---
type: chore
spec: guidelines
status: done
created: 2026-09-07
---

# The unknown-key slots follow the encoder strategy, like every other slot

## What shipped

Every slot a route asks the build for is computed from its encoder strategy, so a route compiles only
what its wire needs. `huk` (hasUnknownKeys) and `uke` (unknownKeyErrors), the pair behind
`strictTypes`, were the two exceptions: written as fixed strings, compiled by every route in every
app, on both directions. They are computed now.

### The rule

`packages/router/src/types/encoder.ts` gained one alias beside `ParamsEncode` and friends:

```ts
type UnknownKeys<Strategy, Key> = Strategy extends 'clone' | 'compact' ? never : Key;
```

It mirrors `DecodeFamily` directly above it. `clone` decodes with `rjs` and `compact` with `cjr`, and
both rebuild the params from the declared type, so a property the type does not name is gone before
validation and before the handler. There is nothing left for an unknown-key check to find. `mutate`
and `direct` decode with `rj`, which restores in place and keeps every key, so those two keep the
pair.

`clone` is the default params encoder, so most routes now compile neither function.

`returnFns` dropped both outright. Nothing reads `returnJitFns.hasUnknownKeys` on any wire: the
answer side is written by the handler, never by a caller.

`packages/core/src/runtypes/mionAdapter.ts` leaves the pair OFF the built set when the marker did not
ask for it, instead of standing in an always-false function, so both readers (the server's
`rejectUnknownKeysOrThrow` and the client's local pre-validation) take their existing
`!hasUnknownKeys` early return.

## Questions the spec left open, and how they were answered

- **Which strategies guarantee no unknown keys.** The spec guessed `compact` alone, with `clone`,
  `mutate` and `direct` all keeping the pair. That was true when it was written and is not any more:
  the decode families were settled separately, `clone` moved to the rebuilding restore, and the
  answer became `clone` and `compact`.
- **The index-signature exception.** No carve-out was needed in the slots. An index signature declares
  every key, so there is nothing undeclared for the check to find there either, and the existing
  runtime skip already covers it.
- **The return direction.** It asks for neither, on every wire.
- **Whether `fmt` rides the same treatment.** Left alone. The `sanitizeParams` lane follows an option,
  not the wire, so it needs its own build-versus-runtime guard rather than a strategy rule. Not
  started.

## What did NOT ship, and why

The spec also asked for a lint error on a route that sets `strictTypes` where the check can never
fire. It was built and then deliberately withdrawn before this landed.

The reason is the option it would report on. `encoder` names one strategy that silently decides four
things (encode and decode, on each of the two directions), and its four names describe only the
encoding half. A rule saying "your `strictTypes` is dead here" has to name the condition in that
vocabulary, and the vocabulary is the part that needs fixing first. Building the rule now would pin
the confusing shape in a diagnostic message and in a lint rule name.

That option's redesign is a separate open spec, and the moot-`strictTypes` signal is written into its
scope rather than left loose.

## Docs

None. The website's validation page already states the behaviour this change follows, that a `clone`
or `compact` route drops an undeclared property before validation, so `strictTypes` belongs with
`mutate` or `direct`. Nothing a reader sees changed: a route that compiles neither function behaves
exactly as it did.
