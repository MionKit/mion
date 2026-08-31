---
type: feature
spec: guidelines
status: done
created: 2026-08-31
completed: 2026-08-31
---

# createParseFn

Getting a typed, validated value out of parsed JSON took three compiled
functions and hand-written glue. `createParseFn<T>()` is those three in one:

```ts
const parseUser = createParseFn<User>();
const user = parseUser(JSON.parse(body)); // typed, or throws RTParseError
```

Input is the output of `JSON.parse`, not a string, so it composes with whatever
read the envelope rather than duplicating it.

Phase 3 of [fused-validators-check-unknowns.md](fused-validators-check-unknowns.md),
which shipped the `checkUnknowns` half.

## What shipped

**Three families — `prs` / `prsf` / `prsp`** (`parse`, `parseFail`,
`parsePreserve`), one per undeclared-key strategy, selected by the scanner from
the `strategy` option. Strategies are operations rather than an axis: the
`AxisJsonStrategy` arm in `DemandFor` assumes a COMPOSITE, and `variantKey` keys
entries off option names with no strategy slot, so a type-walking family with a
strategy axis would have needed new plumbing in both. Three operations needed
none, and reuse the flag-selects-an-operation route `checkUnknowns` established.

**The status holder.** Every parse body takes `(v, st)` and flips `st.ok` at the
first node that does not match, never short-circuiting. Threading a holder is
what lets a dependency-called child report upward, and completing the walk is
what leaves the value fully restored for the error report. The factory then
reads `st.ok` and only pays for a report on failure:

```ts
const status: ParseStatus = {ok: true};
const restored = restore(value, status);
if (status.ok) return restored as DataOnly<T>;
throw new RTParseError(getErrors(restored));
```

Building the report from the RESTORED value is what makes `issues` identical to
`getValidationErrors(restore(v))`. The two tuples ride one
`InjectTypeFnArgs<T, 'prs', 'verr'>` marker, the same way `createStandardSchema`
carries its pair.

**Totality.** The restore arms in `json_restore.go` assume validated input:
`v = BigInt(v)` throws a SyntaxError, `Temporal.X.from(v)` a RangeError, and the
RegExp arm indexes `.match()` output with no null check. Parse is the one family
whose job is untrusted input, so each of those got a shape guard. Everything
else either round-trips raw or fails harmlessly (`new Date('junk')` yields an
Invalid Date, never a throw).

**No-plugin behaviour differs from every other family on purpose.** The others
degrade to identity; parse throws. A parse that quietly accepts everything is a
hole where the caller asked for a gate.

## Two bugs the tests caught, and what they say

**Nested stripping silently did nothing.** A NAMED nested type is
dependency-called, and the call's result has to be ASSIGNED back — a parse body
rebuilds rather than mutates, so a discarded result keeps the original object,
extras and all. An inline nested object worked, which is what made it easy to
miss. `restoreFromJson` threads `assignTo` for exactly this reason.

**Unions do not fuse, and now deliberately do not try.** The first cut assumed a
`[index, payload]` envelope. The O20 round-trip oracle rejected it on the first
run: `buildFlatLayout` decides PER TYPE whether members round-trip raw (nothing
enveloped, restore is identity) or need the flat tuple, whose object branch is
keyed `-1` over a merged-property layout both sides derive together.
Re-deriving that here would be a second implementation of the trickiest wire
format in the codebase, kept in lockstep by hand.

So a union node delegates to the shipped `restoreFromJson` and `validate`
entries for its own type, back to back. That subtree costs two passes instead of
one. It is the whole price, it is local to unions, and it buys correctness by
construction. Fusing unions properly is worth doing later, and worth doing
against the layout builder rather than around it.

## Tests

- `internal/compiler/resolver/parse_test.go` — strategy routing, the demand for
  the validationErrors entry the cold path needs, the guards on each throwing
  leaf, the dependency-call assignment, and the Marker coverage rule.
- `packages/ts-runtypes/test/features/parse.test.ts` — all three strategies, the
  report matching `getValidationErrors`, round-trip, agreement with
  `createValidateFn`, and a junk suite covering every restoring leaf.
- **O20 `parse-roundtrip`** and **O19 `parse-agree`** in the value fuzz lane.
  O20 caught the union bug immediately; O19 pins that parse only ever fails by
  throwing `RTParseError`, never a raw `TypeError` out of a leaf.

## Not built

- Fusing unions (above). Worth its own todo when someone wants that pass back.
- `createSafeParseFn` returning `{success, data | issues}`.
- Parse taking a JSON string. `createJsonDecoderFn` owns that.
