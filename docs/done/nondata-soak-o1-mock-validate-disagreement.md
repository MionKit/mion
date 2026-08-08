---
type: fix
spec: guidelines
status: ready
created: 2026-08-08
---

# The non-data soak finds O1 violations: mock values the validator rejects

## Symptom

The DataOnly non-data soak lane reports **O1** violations — "validate rejected a
value the mock generator produced" — at a rate of roughly 3 per 470 generated
types. O1 is a strong oracle: `createMockDataFn<T>()` must produce a value that
`createValidateFn<T>()` accepts, so every hit is either a mock bug or a validator
bug, and the two disagree on the same `T`.

Found on 2026-08-08 while fixing the soak-timeout item of
[fuzz-followups](../done/fuzz-followups.md). It is **not** caused by that change
(the fix only bounds when the loop stops; the per-iteration seeds are untouched)
— it was hidden before, because the soak used to die on a vitest timeout before
its assertion was read.

## Reproduction

```bash
RT_FUZZ_NONDATA_SOAK_MS=20000 RT_FUZZ_SEED=1 pnpm exec vitest run nonDataTypeFuzz.integration -t soak
# or, now that the lane has an rtx entry:
RT_FUZZ_SEED=1 pnpm rtx core fuzz nondata --soak
```

`[nondata-fuzz] soak finished: 466 types, 3 violation(s), 0 invalid-TS false
positive(s) filtered`. Every violation prints its per-iteration `seed`, so each
replays exactly.

## The three findings (seed 1, 20s budget)

Two distinct shapes, worth splitting once diagnosed:

1. **Negated format** — `¬F:iriReference` (seed `4176415290`), value
   `"Vh_im()#,iO0zk&GS_7"`. The type is "a string that is NOT an
   `iriReference`"; the mock produced this string and the validator rejected it.
   The smallest of the three and the natural starting point: either the mock's
   negation arm draws from a pool the validator still considers a match, or the
   negation validator is over-broad.

2. **Object intersections** — `({4}&{4}&{4})` (seed `1761395552`) and
   `({4}&{3}&{2})[]` (seed `1191249200`), i.e. an intersection of 2-4 member
   object types, and an array of one. The mock builds a value per intersection
   member and merges; the validator checks the merged shape. A member whose
   generated value is overwritten by a later member's key of a different type
   would produce exactly this.

## Direction

Diagnose each shape from its seed, decide whether the mock or the validator is
wrong, and fix with a pinned regression test per shape (the enumerated suites
under `packages/ts-runtypes/test/suites/`, not the fuzz lane). Then re-run the
soak to confirm the rate drops to zero.

Check whether the WILD lane (`pnpm rtx core fuzz types --soak`) reports the same
shapes: its values come from `shapeValue.ts` rather than the product mock, so a
hit there points at the validator and a miss points at `createMockDataFn`.

## Done when

Every O1 shape above is diagnosed, fixed at its real cause, and pinned by an
enumerated regression test; a 60s `nondata` soak reports zero violations.

---

## What shipped (2026-08-08)

All three violations were **one bug**, not two shapes. The intersection cases
were a red herring: their error paths (`["m0_1","key6","p1","m1_2"]` and
`[0,"m1_2"]`) both point at a `FzNot<FzUriReference>` / `FzNot<FzIriReference>`
member buried inside the intersection, exactly like the standalone
`¬F:iriReference` case. The intersection was just where the negated leaf landed.

**Root cause.** `src/mocking/negationMatch.ts` is a runtime mirror of the
question the compiled validators answer by compilation ("does this candidate
match the negated child?"), used for rejection sampling. Its documented bias is
to OVER-match, because an under-match ships a value `validate` rejects. It
under-matched for every pattern-bearing named format:

- `url` compiles to `namedPatternValidate` over its params — there is no
  `new URL()` check anywhere in the emitter — but the walker tested it with
  `new URL()`, which rejects the relative references `UriReference` and
  `IriReference` exist to accept.
- `domain` had the same shape of bug, latent: the loose test demanded a dot,
  while `HOSTNAME_PATTERN` accepts a single label (`"2U8"`, `"hostname"`).

The comment justifying it — "the loose name test is enough for rejection
sampling (params only narrow further)" — was the wrong model: for these brands
the params are WIDER than the stand-in, not narrower.

**Fix.** A registered `pattern` param makes the params the oracle, so
`formatMatches` tests them directly and skips the loose name test. Pattern-less
named formats (`ip`, `uuid`, `idn-hostname`, the RFC email pair) keep the loose
test, where it genuinely over-matches. `idna: 'ascii'` became a no-op arm since
the ASCII pattern riding with it already tests it.

**Pinned by** `packages/ts-runtypes/test/features/negatedFormatMockSoundness.test.ts`
— 8 cases over 200 draws each, covering both fixed shapes, the latent `Hostname`
one, and the pattern-less fallback. Three of them fail against the pre-fix
walker and pass after.

**Verified:** a 90s `nondata` soak at `RT_FUZZ_SEED=1` now reports
`742 types, 0 violation(s)` (was 3).

One thing this did NOT fix: that same soak still reports as a vitest TIMEOUT,
because a single iteration in ~740 takes 340 seconds. Unrelated cause, filed
separately as
[soak-single-iteration-pathology](../todos/soak-single-iteration-pathology.md).
