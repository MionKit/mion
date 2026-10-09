# Shortcut: grow an existing test into a fuzz test

User pointed at an example / unit test, or one concrete behaviour to pin. Grow it, keep both.
- A passing example already paid the three hardest costs: a valid input, a working call, a true check.
- Example + fuzz = the **same test at two zoom levels**: the example pins one point, fuzz sweeps around it.
- Write the example **first**, on purpose: it tells you exactly what to test and which inputs you need.

## Open the test and map its three parts

Set up, call, check (Arrange, Act, Assert) map one-to-one. Three local edits, nothing structural:

| Example test                          | → fuzz part     | The edit                                                |
| ------------------------------------- | --------------- | ------------------------------------------------------- |
| **Set up** a literal input / fixture  | input maker     | which axis did the author freeze arbitrarily? → vary it |
| **Call** the code                     | code under test | **keep verbatim**: it already works                     |
| **Check** `expect(out).toBe(literal)` | rule (oracle)   | constant → a **relation true for every input**          |

- Two are free: the call is the step-1 boundary, already wrapped; the set-up is a hand-built _valid input_.
- Only the check needs real thought.

## Read the inputs off the set-up

- Don't invent an input space. Widen the one the test uses: find what was frozen (value, length, field set, order).
- Loudest tell: a `valid[]` + `invalid[]` list. That split names your **two input makers**:

```ts
// test/suites/validation/Atomic.test.ts → assertValidateStatic (validationAsserts.ts)
valid.forEach((v) => expect(validate(v)).toBe(true)); //   ← createMockDataFn<T>() generates this side
invalid.forEach((v) => expect(validate(v)).toBe(false)); // ← mutateToInvalid(schema, mock) generates this side
```

- `createMockDataFn(schema)` replaces the `valid` array (valid by construction).
- `mutateToInvalid` (`test/fuzz/value/invalidValue.ts`, used by `fuzzRunner.ts`) replaces `invalid`
  (corrupts one provably-invalid spot).
- **Table-driven** test: each row is a hand-found example; the row dimension is your input maker.

## Turn the check into a rule, with the user (the only hard part)

`toBe(constant)` holds for _this_ input only; a fuzz rule holds for _all_. Pick the move by the check's shape:

- A **relation** already (round-trip / idempotence) → same relation over an input maker. _Trivial_:
  swap literal `x` in `expect(decode(encode(x))).toEqual(x)` for `createMockDataFn<T>()`, done.
  Repo pair: `assertCloneCloneRoundTrip` (serializationAsserts.ts) → `checkJsonStable` (fuzzOracle.ts).
- **true/false** on a hand-picked good / bad value (the workhorse) → two input makers + the consistency invariant.
  The relation ties the code's two outputs: `validate(x) ⇔ getValidationErrors(x).length === 0`, every `x`.
  Repo pair: `assertGetValidationErrorsContract` (validationAsserts.ts) → `checkErrorsAgree` (fuzzOracle.ts).
  Also `checkValidAccepted` / `checkInvalidRejected` (fuzzOracle.ts).
- A **constant you can recompute** (`toBe(5)`) → compare to a trusted source (differential),
  or the predicted-change relation it is an instance of.
- A **hardcoded "this once broke"** regression → random inputs **around** that hazard.
- Run the grown rule through the iron rule ([rules.md](rules.md)): break the output, watch it go red.
  A constant generalised lazily into a sloppy rule throws false alarms.

## Share the check between both tests

- Rule lives in ONE place, called from both: pull the check into a helper the example AND fuzz test call.
  Never copy it into the fuzz runner; copies drift apart.
- Repo: `test/util/*Asserts.ts` IS the shared rule layer from the example side (`assertValidateStatic`,
  `assertCloneCloneRoundTrip`, …), one rule each.
- Shared normaliser `normalizeForComparison` / `deepCloneForRoundTrip` (equalsHelpers.ts) is imported by
  both `serializationAsserts.ts` and `idIntegrityAsserts.ts`.
- Today the fuzz checks _mirror_ those asserts (`checkErrorsAgree` re-expresses
  `assertGetValidationErrorsContract`) instead of importing them. Sharing is the cleaner end state.
- Discipline: write the rule once, pin it with examples, sweep it with fuzz.

## Keep the example: fast reproducer and shrink floor

- Growing ADDS a test, never replaces one. The example stays: fastest reproducer (known-minimal seed),
  executable intent, 1 ms smoke beside a multi-second soak.
- Shrink floor: fuzz failure shrinks to something **simpler** than the example → promote it to a new example test.

## Tell the user when NOT to bother

- **Pure one-answer transforms** (deterministic `transform(input) === expected`, no error path): nothing to sweep.
  e.g. `transformAsserts.ts`. The examples are enough.
- **Inputs the maker cannot reach yet**: e.g. `circularGuardAsserts.ts` needs a _cyclic_ value the default
  `createMockDataFn` RNG never produces. Fix the maker first, or the rule passes for the wrong reason.
- Test to apply: _is there an axis worth varying, and a rule that stays true as it varies?_
  Yes → grow it. No → the example already is the right tool.
