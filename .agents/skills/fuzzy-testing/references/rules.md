# Step 3: What should always be true? (the rules)

Rules (oracles) hold for EVERY input, not one example. The heart of the method: a weak rule finds only crashes.
Run it as a LOOP: investigate, propose a few rules from their code, user confirms / corrects, refine, repeat.

## Harvest first

- Grep existing example / unit tests of this code. Their assertions are candidate rules: bring them to the user.
- Ask in plain English what the code promises ("decode what you encoded → value back"; "unknown field rejected").
  Each promise = a candidate rule.

## Walk the rule shapes with the user

Per shape: pointed question grounded in THEIR code, rule proposed in their terms, user confirms or corrects.
Sweep ALL shapes: cover them, never stop at the first hit. Most code fits 3 to 5. Offer a few, then come back.

1. ① never crashes (totality): never crashes or hangs, only _controlled_ outcomes, returns the declared type?
   Free baseline, always applies. e.g. `decode(junk)` throws `DecodeError`, not `RangeError`.
2. ② do it then undo it (round-trip): inverse op (encode/decode, parse/print, gen/read) gives back the start?
   Highest payoff. e.g. `encode(decode(w)) === w`.
3. ③ doing it twice (idempotence): second pass changes nothing, `f(f(x)) === f(x)`?
   e.g. a second `--update` is byte-identical.
4. ④ a fact always holds (invariant): output still valid, a count adds up, a length or bound holds?
5. ⑤ compare to a trusted source (differential): second impl, old version, or two paths to the same answer?
   e.g. vs `JSON.parse`, vs the previous implementation.
6. ⑥ predicted change (metamorphic): transform input `t`, predict the output relation without knowing the output.
   `rel(f(x), f(t(x)))` holds. e.g. add a field ⇒ exactly that node appears, nothing else.
7. ⑦ leave the rest alone (preservation): unrelated change leaves content the op must carry through untouched?
   e.g. an authored value survives an unrelated edit.
8. ⑧ reject bad input (negative space): which inputs are illegal, what should happen?
   Rule = reject with a specific, actionable signal. Never a crash, never a silent accept.
   e.g. unknown field ⇒ `enrich-mock-unknown-field` / `enrich-text-unknown-field`.

- After a pass ask: "anything I'm missing that should always hold here?" Stop when fitting shapes are covered.

## Real oracles in this repo

`packages/run-types/test/fuzz/value/fuzzOracle.ts` (+ `cloning/cloneOracle.ts`):

- O3 ①: `validate` is total on ANY input, even junk. Non-boolean result or a throw = O3 violation.
- O5 ②: `jsonEncode(jsonDecode(wire1)) === wire1`, else "json round-trip not stable".
- O1 / O2 ④: `validate(mock())` is true; `validate(corrupt(mock()))` is false.
- O4 ⑤: `validate(x) === (getValidationErrors(x).length === 0)`. Two functions, one truth.
- O15 ⑤: compiled `clone` deep-equals a slow reference interpreter (`referenceClone`).

## Pin where each rule came from

- Ask the source of each kept rule. Drop the guesses: an invented rule is the main cause of false alarms.
- Source also says how much to trust it, and whether it is independent of the code under test:
  - specified: written spec / contract / type (strongest intent). Code comments count.
  - derived: the type / schema itself, by reflection ("value of T must validate(T)").
  - inverse: an inverse operation (round-trip).
  - differential: a 2nd impl / 2nd view / old version.
  - domain-law: math / algebra (commute, assoc, idempotent, conserve).
  - implicit: universal (no crash, total, terminates). Free, weak.
  - past bug.

## ⚠️ The iron rule: red = real bug, every time

- A rule you fail the build on must be sound: when it fires, something is _truly_ wrong.
- Missed bug costs only coverage. False alarm (red on correct behaviour) costs trust, suite gets ignored.
  Never trade toward false alarms.
- Tell the user plainly, then prove it: break the expected output on purpose, watch the rule go red with the right
  signal, put it back. A rule never seen failing is not trustworthy yet.
- e.g. enrich fuzzer: asserted bogus code `enrich-mock-bogus`, watched it fail + shrink to one event.
  Proof the check was live, not passing for the wrong reason.
- This repo's soundness guards:
  - `invalidValue.ts` corrupts only where `proven` is true (provably invalid in isolation).
    Never under union / any / index-sig.
  - O5 compares the wire image (encode∘decode∘encode), NOT value equality.
    Sidesteps the optional-`undefined`-key vs dropped-key mismatch (a false positive).

## Strong rules, floor kept, inputs reach the case

- Weak → strong: totality, invariant, idempotence, metamorphic / conservation, round-trip + differential.
- Prefer strong (undo-it, trusted source, predicted change): they catch silent wrong-but-doesn't-crash bugs.
- Always keep ① never crashes as the floor. Minimum: floor + one strong rule.
- Confirm the input maker reaches the situation a rule talks about, or it passes for the wrong reason.
  ⑧ needs _invalid_ inputs (`mutateToInvalid`). A rule about cycles needs a maker that builds cycles.
  (The QuickChick "shadowed variable" lesson.)

## Gather the rules in one place (hand-off to step 4)

- One `check*(target, value, ctx) -> Violation | null` per rule: [oracle-layer.ts](../templates/oracle-layer.ts).
- Collect them behind one typed `FuzzTarget`: the handshake between input maker and rules.
- Share ONE set of rule-checks: the same helper called with hand-written data (example) and generated data (fuzz).
  Then the two cannot drift. Detail → [grow-test.md](grow-test.md#share-the-check-between-both-tests).
