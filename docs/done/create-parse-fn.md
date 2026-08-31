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

**Three families — `prs` / `prss` / `prsf`** (`parse`, `parseStrip`,
`parseFail`), one per undeclared-key strategy, selected by the scanner from the
`strategy` option. Strategies are operations rather than an axis: the
`AxisJsonStrategy` arm in `DemandFor` assumes a COMPOSITE, and `variantKey` keys
entries off option names with no strategy slot, so a type-walking family with a
strategy axis would have needed new plumbing in both. Three operations needed
none, and reuse the flag-selects-an-operation route `checkUnknowns` established.

**The body is a COMPOSITION, not a walk of its own.** This is the second design;
the first is recorded below because the reasoning matters more than the outcome.

```js
function prs(v){
  v = <ukuw>?.fn(v) ?? v;                              // strip strategy only
  try{ v = <rj>?.fn(v) ?? v }catch{ throw utl.parseMismatch(v) }
  if(!(<val|vst>?.fn(v) ?? true)) throw utl.parseMismatch(v);
  return v
}
```

Each `?.fn` reaches a separately compiled, separately cached, separately tuned
entry, so every improvement to `validate` or `restoreFromJson` now reaches parse
for free and parse can no longer drift behind the families it duplicates.
`ParseEmitter.EmitDependencyCall` panics on purpose: `Emit` renders the whole
body at the root and never calls `CompileChild`, so reaching it would mean the
design had quietly changed.

Per strategy:

- **preserve** (default): `rj` + `val`. Nothing rebuilt, undeclared keys kept.
- **strip**: `ukuw` + `rj` + `val`. The pre-pass blanks undeclared keys before
  the restore walks the declared shape, the same two-step the `strip` JSON
  decoder uses.
- **fail**: `rj` + `vst`. `vst` is `validate{checkUnknowns}`, so rejecting an
  undeclared key costs one fused pass rather than two calls.

Loose is the default: it is the cheapest shape (no pre-pass, no key check) and
it is what zod does, which strips only under `.strict()`. A project can set the
default for every parser through the `parse.strategy` plugin / tsconfig option,
merged site-wins exactly like `validate.numberMode`. Because parse is
`AxisNone`, that default is threaded into `computeSiteFn` and resolves which
FAMILY serves the site, rather than merging into an option set.

**The restore call is wrapped, and elided when it is identity.**
`restoreFromJson` assumes its caller already validated, so on malformed input it
throws RAW: a `SyntaxError` out of `BigInt('nope')`, a `TypeError` from the
RegExp arm indexing `.match()` output with no null check. Parse is the one
family whose whole job is untrusted input, so the call is wrapped and any throw
becomes the same mismatch signal. That is what makes parse total: no input,
however malformed, escapes as anything but `RTParseError`. When
`isNoopForRestoreJson` proves the restore is identity over the whole subtree,
the call and its `try` are omitted outright.

**Failure is signalled by THROWING.** There is nowhere else to put the verdict:
the return value is the restored data. The `ParseMismatch` sentinel carries that
restored value, which is what makes `RTParseError.issues` identical to
`getValidationErrors(restore(v))`. Building the report is the caller's cold
path, so a matching value never pays for it.

**No-plugin behaviour differs from every other family on purpose.** The others
degrade to identity; parse throws. A parse that quietly accepts everything is a
hole where the caller asked for a gate.

## Two designs that were measured and dropped

**A per-node walk that restored and checked in one pass.** The premise was that
one walk beats two. It does not: on a realworld order DTO the fused walk ran at
0.42x of a plain `validate` while doing the same work, against 0.73x for the two
separate calls it was meant to beat. The cause is the shape of the emitted code,
not the idea — a walk that records a verdict emits STATEMENTS with per-node
status writes, where `validate` emits one `&&` expression the engine folds.

Node v26.8.1, 4-core Xeon @ 2.80GHz, pool of 64 distinct values indexed per
iteration, results accumulated into a sink, best of 5 rounds. The pool and the
sink both matter: a first attempt with a constant input and a discarded result
measured 203 M ops/s, because the engine hoisted the call out of the loop and
then deleted it.

| | M ops/s | vs validate |
|---|---|---|
| `validate` alone | 93.9 | 1.00x |
| `restoreFromJson` + `validate` (the composition) | 68.6 | 0.73x |
| `parse{preserve}`, per-node walk | 39.6 | 0.42x |
| `parse{preserve}`, composition | 66.0 | 0.70x |

The composition reaches 0.96x of the two-call form it replaces. The remaining 4%
is the one extra call frame.

**A caller-provided status holder** instead of throwing. Every body took
`(v, st)` and flipped `st.ok`, never short-circuiting, so a dependency-called
child could report upward. It forced every consumer of the raw parse function to
allocate and reuse a holder, and the allocation landed on the HAPPY path.
Throwing is slower on the failure path and free on the success one, which is the
right trade for a function whose whole point is that most inputs are fine.

## Two bugs the tests caught, and what they say

**Nested stripping silently did nothing.** A NAMED nested type is
dependency-called, and the call's result has to be ASSIGNED back — a parse body
rebuilds rather than mutates, so a discarded result keeps the original object,
extras and all. An inline nested object worked, which is what made it easy to
miss. This is what the composition removed the possibility of: there are no
dependency calls left to forget to assign.

**Unions do not fuse, and now deliberately do not try.** The first cut assumed a
`[index, payload]` envelope. The O20 round-trip oracle rejected it on the first
run: `buildFlatLayout` decides PER TYPE whether members round-trip raw (nothing
enveloped, restore is identity) or need the flat tuple, whose object branch is
keyed `-1` over a merged-property layout both sides derive together. Re-deriving
that here would be a second implementation of the trickiest wire format in the
codebase, kept in lockstep by hand. The composition made the question moot: every
type, union or not, delegates to the shipped entries.

## Tests

- `internal/compiler/resolver/parse_test.go` — the body composes rather than
  walks, the restore call is wrapped, it is omitted when nothing restores,
  `fail` checks through the fused validator, `strip` runs the pre-pass, failure
  is signalled by throwing, and the Marker coverage rule.
- `internal/compiler/resolver/parse_strategy_default_test.go` — the project-wide
  default fills in per site, an explicit `preserve` opts back out, and no default
  leaves every site loose.
- `packages/ts-runtypes/test/features/parse.test.ts` and `test/suites/parse/` —
  all three strategies, the report matching `getValidationErrors`, round-trip,
  totality over a junk suite covering every restoring leaf, and the bare call
  pinned separately from `preserve` so a change to the default cannot pass by
  only updating the option-carrying case.
- **O19 `parse-agree`** — two-sided against `restoreFromJson + validate`.
  One-sided it would have been satisfied by a parse that rejected everything;
  made two-sided it immediately found that the parse guards were STRICTER than
  the restore arms they guarded. **O20 `parse-round-trip`** — parse must read
  back whatever the JSON encoder wrote. O20 caught the union bug above on its
  first run.

## Not built

- Fusing unions (above). Worth its own todo when someone wants that pass back.
- `createSafeParseFn` returning `{success, data | issues}`.
- Parse taking a JSON string. `createJsonDecoderFn` owns that.
