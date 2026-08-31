---
type: chore
spec: guidelines
status: ready
created: 2026-08-31
---

# Reconsider what a parse body should be: fused walk, or a concat of the parts

## Intent

`createParseFn<T>()` currently emits its OWN per-node walk that restores and checks in one pass.
The premise was that one walk beats two. Measurement says the premise does not hold, and the
alternative worth trying is much simpler: emit a body that just concatenates the parts that
already exist.

```js
// what a parse body might be instead
function prs(v, st) {
  v = rj_T(v);                          // omitted entirely when the restore is a noop
  if (!vst_T(v)) st.ok = false;         // validate, or validate{checkUnknowns} for the fail strategy
  return v;
}
```

Each half is a function the resolver already emits, already tests, and already tunes. Parse would
own nothing but the glue, so it could never again drift behind the family it duplicates, which is
exactly what happened here.

## What the measurements said

Taken on the emitted bodies for a realworld order DTO (nested object, array of objects, a second
nested object, a union, all scalars, so NOTHING to restore). Node v26.8.1, 4-core Xeon @ 2.80GHz,
pool of 64 distinct values indexed per iteration, results accumulated, best of 5 rounds.

| | M ops/s | vs validate |
|---|---|---|
| `validate` alone | 88.7 | 1.00x |
| `restoreFromJson` + `validate` (the composition) | 64.1 | 0.72x |
| `parse{preserve}` BEFORE the delegation fix | 39.6 | 0.45x |
| `parse{preserve}` after it | 62.8 | 0.71x |
| `parse{strip}` (the default) | 21.0 | 0.24x |

Two fixes already landed and are NOT what this todo is about:

- one status object per compiled fn rather than per call (`createParseFn`)
- a subtree with nothing to restore delegates to its `val` entry instead of walking itself
  (`delegateToValidate` in `parse.go`), which is what closed 0.45x to 0.71x

The open question is whether the remaining hand-written walk should exist at all.

## What to work out

- **Does the concat actually win?** The delegation fix already proves the shape is competitive for a
  non-restoring subtree. Measure the restoring case honestly: a fused walk is one pass, the concat
  is two, but each of the concat's passes is far cheaper per node. Build both and compare on a type
  with Dates and bigints as well as one without.
- **The `strip` default is the hard part.** `restoreFromJson` does not drop undeclared keys, so a
  naive concat loses stripping, which is the security-relevant default. Find what the JSON decoder
  composes for its own `strategy: 'strip'` and whether parse can reuse the same piece. If stripping
  needs its own rebuild pass regardless, the concat becomes three passes and the trade changes.
  `parse{strip}` at 0.24x is dominated by that per-node object rebuild, not by the check shape.
- **`fail` may get simpler, not harder.** That strategy is exactly `validate{checkUnknowns}`, which
  now exists as its own family, so the concat form gets it for free where the fused walk has to
  re-implement the key check.
- **What the error report costs.** Parse never builds errors on the happy path; it re-walks with
  `getValidationErrors` only after a failure. Any redesign keeps that, so the comparison against
  `validate` + `getValidationErrors` only differs on invalid values and should be measured there
  separately.
- **Keep the guarantees.** Whatever shape wins must still be total (only ever `RTParseError`, never
  a raw `SyntaxError` from `BigInt()` or a `TypeError` from the RegExp arm) and must still accept
  exactly what `restoreFromJson` + `validate` accepts. The O19 fuzz oracle already pins the second
  one both ways; the parse suite and `parse.test.ts` pin the first.

## Already ruled out, do not re-litigate

**Throwing at the mismatch instead of threading a status object.** The reasoning is appealing (parse
throws anyway, so the happy path should allocate nothing), but measured on the emitted shape it buys
nothing and costs on failure:

| happy path | M ops/s | vs validate |
|---|---|---|
| `validate` | 96.9 | 1.00x |
| status object, fresh per call | 47.4 | 0.49x |
| status object, reused | 56.4 | 0.58x |
| throw at the mismatch | 55.8 | 0.58x |

Throwing and reusing tie, because on the happy path the `st.ok=false` writes never execute: they sit
in untaken branches exactly like a `fail()` call would. The per-call allocation was the entire
difference, and reusing one object per compiled fn already removed it. On data where 1 in 64 values
is invalid, throwing drops to 0.81x of the status form.

It would also cost the full issue list: aborting at the first mismatch leaves the value half
restored, so `RTParseError.issues` would carry either a single issue or bogus entries for the tail
that never got restored.

Note this is about the FUSED body only. In the composition shape this todo proposes, the status
question disappears on its own: restore returns the value, validate returns the boolean, and there
is nothing to thread.

## Notes

Read the emitted bodies before deciding anything. Dump them with a throwaway test in
`internal/compiler/resolver/` that calls `scanEntryModules` and prints `EntryModules`; the raw cache
modules are one line each and need pretty-printing to be readable.

Beware the benchmark traps that cost two wrong answers here: a single constant input lets V8 hoist a
pure validator clean out of the timed loop, and discarding the result lets it delete the call
outright. Use a pool of distinct values and accumulate every result. Also check whether the
reference you picked is a noop entry (`['rj',,,'Order',,true]` has no body at all) before concluding
anything from it.
