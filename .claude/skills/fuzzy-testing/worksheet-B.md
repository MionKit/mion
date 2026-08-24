# Step 3: What should always be true? (the rules)

> You're facilitating the rules discovery, the heart of the whole thing. Run it as a
> LOOP, not a one-pass form: investigate, propose a few candidate rules grounded in the
> user's code, let them confirm or correct, refine, come back for more. The user knows
> what "correct" means here; you know the rule shapes and the codebase. Full prose:
> [framework-fuzzy-testing.md → Step 3](framework-fuzzy-testing.md#step-3-what-should-always-be-true).

## Start by harvesting what's already there

- Grep for existing example/unit tests of this code. Their assertions are candidate
  rules already. Pull them out and bring them to the user.
- Ask the user, in plain English, what the code promises ("if you decode what you
  encoded, you get the value back"; "an unknown field is rejected"). Each promise is a
  candidate rule.

## Walk the rule-shape checklist with the user (this is the loop)

Go down the list. For each shape, ask the user a pointed question grounded in THEIR code,
propose the rule in their terms, and let them confirm or correct it. Keep the shapes that
fit (most code matches three to five). You won't get them all in one pass, so offer a
few, get reactions, refine, then come back for the rest.

| #   | Rule shape                  | Ask…                                                             | Example                                               |
| --- | --------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------- |
| ①   | never crashes               | never crashes or hangs; only _controlled_ outcomes?              | `decode(junk)` throws `DecodeError`, not `RangeError` |
| ②   | do it then undo it          | does undoing it give back what you started with?                 | `encode(decode(w)) === w`                             |
| ③   | doing it twice              | does a second pass change nothing? `f(f(x)) === f(x)`?           | a second `--update` is byte-identical                 |
| ④   | a fact always holds         | is some fact about the output always true?                       | output re-validates; a length or bound holds          |
| ⑤   | compare to a trusted source | does it match a second, trusted way to get the answer?           | vs `JSON.parse`, vs the previous implementation       |
| ⑥   | predicted change            | does a known input change cause the output change you predicted? | add a field ⇒ exactly that node appears               |
| ⑦   | leave the rest alone        | does an unrelated change leave everything else untouched?        | an authored value survives an unrelated edit          |
| ⑧   | reject bad input            | is a _bad_ input always reported, never quietly accepted?        | unknown field ⇒ a specific diagnostic (MD001/FT002)   |

After a pass, ask the user: "anything I'm missing that should always hold here?" Stop
when the shapes that fit are covered.

## Pin down where each rule came from

- For each rule you keep, ask the user where it comes from: a spec, a code comment, a
  past bug, or a guess. Drop the guesses. An invented rule is the main cause of false
  alarms.

## ⚠️ Set up the iron rule (tell the user, then prove it)

- Tell the user plainly: when a rule goes red, there must be a REAL bug, every time. A
  rule that misses a bug only costs coverage; a rule that cries wolf (goes red when
  nothing is wrong) destroys trust in the whole suite.
- Then prove each rule you'll fail the build on: break the expected output on purpose and
  watch the rule go red, with the right signal. A rule you've never watched fail isn't
  trustworthy yet. (Enrich fuzzer: we asserted a bogus code `MD999`, watched it fail and
  shrink to one event, proof the check was live rather than passing for the wrong
  reason.)

## Prefer strong rules, and check your inputs reach the case

- Steer the user toward strong rules (do-it-then-undo-it, compare-to-a-trusted-source,
  predicted-change) over the weak "doesn't crash", but always keep "doesn't crash" (①)
  as the floor.
- Before trusting a rule, confirm the input maker actually reaches the situation the rule
  talks about. The reject-bad-input rule (⑧) needs _invalid_ inputs (`mutateToInvalid`);
  a rule about cycles needs a maker that builds cycles. A rule over inputs your maker
  never produces passes for the wrong reason and tells you nothing.

## Gather the rules in one place (what you hand to step 4)

- Write one `check*(target, value, ctx) -> Violation | null` per rule, see
  [`templates/oracle-layer.ts`](templates/oracle-layer.ts). Collect them behind one typed
  `FuzzTarget` (the handshake between the input maker and the rules).
- Share one set of rule-checks between the example tests and the fuzz tests: the same
  helper, called once with hand-written data (example) and once with generated data
  (fuzz), so the two can't drift apart. (In this repo the `test/util/*Asserts.ts` files
  are that shared layer; the fuzz checks currently _mirror_ them, and sharing is the
  cleaner end state.)
