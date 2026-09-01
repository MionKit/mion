# A Framework for Fuzzy Testing

> A practical, code-first way to add fuzz testing to a system. Fuzz testing means
> you throw a flood of random inputs at your code and check a rule that should hold
> for every one of them.
>
> This guide walks five steps:
>
> 1. **What are you testing, and what can you see?** — name the one piece of code
>    under the microscope, and write down what you can actually watch it do.
> 2. **Is fuzzing even worth it here?** — a quick gut-check before you invest.
> 3. **What should always be true?** — the rules that must hold for every input.
>    This is the heart of the whole thing.
> 4. **Build the pieces** — the input maker, the replay button, the loop, the
>    shrinker. Reuse what exists; build only the gaps.
> 5. **Run it hard, and keep what breaks** — soak it, and pin every failure as a
>    test.
>
> The shortcut: **already have a normal test? Grow it.** A regular test hands you an
> input, a call, and a check — most of steps 1 and 3 come for free.
>
> Every step has runnable code, grounded in this repo's real fuzz harness
> (`packages/run-types/test/fuzz/`). It is written to become a reusable
> **skill** ("Make it a skill", below). Its first real test case is the
> **FriendlyType / MockData sync pipeline** ("A real one", below) — we are the
> framework's first users.

---

## What fuzzy testing is

Example-based tests check the cases _you thought of_. A fuzz test does the
opposite: it **makes** a flood of inputs you would never write by hand, runs the
system on each, and checks a rule that should always be true (an _oracle_). The
bug is whatever breaks the rule.

```
                 ┌──────────────────────────────────────────────┐
                 ▼                                              │
  ┌──────────┐  generate  ┌──────────┐  run   ┌──────────┐ observe │
  │ GENERATOR │ ─────────► │  INPUT   │ ─────► │   SUT    │ ──────┐ │
  └──────────┘            └──────────┘         └──────────┘       │ │
       ▲ seed                                                     ▼ │
  ┌──────────┐  pass/fail decided by  ◄───────────────── ┌──────────────┐
  │  SHRINK  │ ◄───────── ORACLE (the rule) ──────────── │  OBSERVATION │
  └──────────┘   on fail: minimise + keep the seed       └──────────────┘
```

The moving parts: the **input maker** (generator) hands a fresh random input to
**the code you're testing**, you **watch what comes out** (observation), and a
**rule** (oracle) decides if that output is wrong. Save one number (a **seed**) and
any finding replays exactly. When a rule breaks, **shrinking** cuts the input down
to its smallest form. Steps 4 and 5 build the parts that produce inputs and make
them replayable; step 3 finds the rule. Get both and you have a fuzz test. Already
have an example test? Growing it is the shortcut — it hands you a first cut of both
from the test you already wrote.

> The two genuinely hard parts are never "how do I randomise bytes." They are
> **(1) making inputs the system actually accepts** and **(2) knowing when an
> output is wrong**. The five steps below are a process for exactly those two.

---

## The five steps at a glance

1. **What are you testing, and what can you see?** — pick the one piece of code; list what goes in and what you can watch come out.
2. **Is fuzzing even worth it here?** — only invest if you can run it in a loop, force repeatable runs, and tell right from wrong cheaply.
3. **What should always be true?** — run down a checklist of rule shapes; keep the ones that fit; prove each one catches a real break.
4. **Build the pieces** — the input maker, the replay button (seed), the loop, the shrinker. Reuse first.
5. **Run it hard, and keep what breaks** — soak thousands of inputs; save every shrunk failure as a regression test.

- **Shortcut: already have a normal test? Grow it.** — widen its input into the input maker, lift its check into a rule, keep the original.

---

## Step 1: What are you testing, and what can you see?

Name the one piece of code you'll put under the microscope (the _thing under test_).
Pick the smallest function or pipeline you can call directly. Smaller means faster
iterations and a sharper rule. Write its signature down. That signature _is_ the set
of inputs you must make and the output you must watch.

```ts
// SUT boundary = one typed function you can call a million times in-process.
type SUT<In, Out> = (input: In) => Out;

// e.g. a codec under test:
declare function encode(user: User): string;
declare function decode(wire: string): User;
```

If you can only reach the system through a command-line tool, a server, or the
filesystem, the thing under test is still a function. You just wrap the
side-effecting boundary (`runCommand(args, files) -> {stdout, files, diagnostics}`).
Keep wrapping until you have something pure-ish and callable. (This is exactly what
the enrichment pipeline needs, in "A real one" below.)

Just as important as the input: write down what you can actually watch come out.
The return value, the errors it throws, the files it writes, its logs, its exit
codes, its diagnostics. The rule can only check what you can see.

```
return value         → compare / assert properties on it
thrown error         → catch; classify (expected vs uncaught)
written files        → read them back (use an in-memory FS so it's cheap + isolated)
diagnostics list     → assert codes/severity (← the enrichment pipeline's main output)
logs / events        → capture a buffer
coverage             → instrument, to steer generation (optional, advanced)
```

If the code hides its effects (writes to a real disk, logs to stdout), wrap it so
those effects come back as a value you can inspect. That wrapper is part of your
tooling.

Why name this first: you can't decide what to check if you don't know what you can
see. A checker that is blind to inline functions simply cannot have a rule about
them. What you can see limits what you can check.

---

## Step 2: Is fuzzing even worth it here?

A 30-second gut-check before you invest. Fuzzing pays off only when all three of
these hold:

- **You can run the code over and over with different inputs.** It's fast and
  callable in a loop.
- **The same input always does the same thing, or you can force that.** No loose
  randomness, no clock or network you can't pin down.
- **You have a cheap way to tell right from wrong without re-doing the code's
  job.** This is the key one. If the only way to know the right answer is to rebuild
  the thing the code already does, fuzzing won't help you — you'd just be comparing
  two copies of the same possible bug.

If any one of these is false, stop. A handful of hand-written examples is the better
tool here.

---

## Step 3: What should always be true?

List the rules that must hold for EVERY input, not just one example. These rules are
the heart of the whole thing (the jargon word is _oracle_), and they are the hard,
valuable half. A fuzzer with a weak rule finds only crashes. Run down this short
checklist of common rule shapes and keep the ones that fit your code. Sweep _all_ of
them — the goal is to cover the shapes, not to stop at the first hit.

**① It never crashes or hangs** (totality / robustness) — _the free baseline, always
applicable._ For any input, even random junk, no crash, and it returns the declared
type.

```ts
// RunTypes O3 (real): validate is total on ANY input — even random junk.
const r = target.validate(value);
if (typeof r !== 'boolean') fail('O3', 'validate returned a non-boolean');
// (wrapped in try/catch → a throw is also an O3 violation)
```

**② Do it, then undo it, and you get back what you started with** (round-trip) —
_highest payoff._ Is there an inverse operation (encode/decode, parse/print,
gen/read)?

```ts
// RunTypes O5 (real): re-encoding a decode of the wire reproduces the wire.
const wire1 = target.jsonEncode(value);
const wire2 = target.jsonEncode(target.jsonDecode(wire1));
if (wire1 !== wire2) fail('O5', 'json round-trip not stable');
```

**③ Doing it twice changes nothing the second time** (idempotence). Is re-running
the operation supposed to be a no-op? (← `gen ∘ gen`, in "A real one" below.)

```ts
const once = f(x);
const twice = f(once);
if (!deepEqual(once, twice)) fail('idempotence', 'f(f(x)) !== f(x)');
```

**④ Some fact about the output is always true** (an invariant). What holds of the
result no matter the input (it's still valid; a count adds up)?

```ts
// RunTypes O1/O2 (real): the validator's defining invariants.
if (!target.validate(mock())) fail('O1', 'rejected a valid mock');
if (target.validate(corrupt(mock()))) fail('O2', 'accepted a provably-invalid value');
```

**⑤ It agrees with a second, trusted way of getting the same answer**
(differential). Is there a second implementation, an old version, or two paths to
the same answer?

```ts
// RunTypes O4 (real): two functions, one truth.
const ok = target.validate(value);
const noErrors = target.getValidationErrors(value).length === 0;
if (ok !== noErrors) fail('O4', `validate=${ok} but errors disagree`);

// RunTypes O12 (real): the JSON and binary wires must agree on the same value.
const jsonWire = target.jsonEncode(value);
const viaBinary = target.jsonEncode(target.binaryDecode(target.binaryEncode(value)));
if (jsonWire !== viaBinary) fail('O12', 'JSON and binary wires disagree');
```

**⑥ Change the input in a known way, and the output changes the way you predicted**
(metamorphic). Can you transform the input so that you can predict the effect on the
output, without knowing the output itself? (← the core of "A real one" below: a type
edit causes a bounded change in the generated file.)

```ts
// Generic shape: transform t on input → relation rel must hold on the outputs.
const y1 = f(x);
const y2 = f(t(x));
if (!rel(y1, y2)) fail('metamorphic', `f and f∘t disagree under ${t.name}`);
// e.g. add one field to a type ⇒ the generated file gains exactly one node, nothing else.
```

**⑦ An unrelated change leaves everything else untouched** (preservation). Is there
content the operation must carry through unchanged? (← human edits preserved across
re-sync, in "A real one" below.)

```ts
const before = readAuthoredContent(file);
const after = readAuthoredContent(regenerate(file, unrelatedChange));
if (!deepEqual(before, after)) fail('preservation', 'an unrelated change clobbered authored content');
```

**⑧ Feed it bad input on purpose, and it must complain, never quietly accept it**
(negative space). What inputs are illegal, and what should happen? The rule is not
just "reject" but "reject with a specific, actionable signal — never a crash, never
a silent accept." (← "user adds an unrelated node in comptime args → _then what?_",
in "A real one" below.)

```ts
const diags = run(illegalInput);
if (diags.length === 0) fail('neg', 'illegal input silently accepted');
if (!diags.some((d) => d.code === EXPECTED_CODE)) fail('neg', `wrong/no diagnostic for ${illegalInput}`);
```

### Note where each rule came from

For each rule you keep, write down its source. This tells you how much to trust it,
and (this matters for the self-improvement sequel) whether it is independent of the
code under test. Don't invent rules. An invented rule is the main cause of false
alarms.

```
specified   : from a written spec / contract / type        (strongest intent)
derived     : from the type/schema itself (reflection)      ← "value of T must validate(T)"
inverse     : from an inverse operation                     (round-trip)
differential: from a 2nd impl / 2nd view / old version
domain-law  : math/algebra (commute, assoc, idempotent, conserve)
implicit    : universal (no crash, total, terminates)       (free, weak)
```

### The one iron rule

A failing test must ALWAYS mean a real bug. A false alarm — the test goes red but
nothing is actually wrong — destroys trust and gets the whole suite ignored. So a
rule you fail the build on must be **sound**: when it fires, something is _truly_
wrong. The trade only ever goes one way:

> **A missed bug** (the rule never fires when it should) only costs you coverage.
> **A false alarm** (the rule fires on correct behaviour) costs you trust. Never
> trade toward false alarms.

So before you trust a new rule, break the output on purpose and watch the rule catch
it. We did exactly this: we told a test to expect the wrong answer, watched it fail
and point at the precise spot, then put it back. That proved the check actually
works. (The real story is the negative control in "A real one" below — we asserted a
bogus code, **MD999**, and confirmed the probe truly ran.)

This repo encodes the soundness rule literally: corruption only happens at a
position that can be _proven_ invalid in isolation, and the metamorphic comparison
uses the **wire image** (not value equality) so a benign representation difference
never fires falsely:

```ts
// fuzzOracle.ts O5/O6 compare encode∘decode∘encode, NOT value equality —
// sidesteps the optional-`undefined`-key vs dropped-key mismatch (a false positive).
// invalidValue.ts only corrupts where `proven` is true; never under union/any/index-sig.
```

### Prefer strong rules, but always keep the floor

Rank your rules and make sure you have at least the floor plus one strong rule.
Prefer the strong shapes (undo-it, compare-to-a-trusted-source, predicted-change)
because they catch silent wrong-but-doesn't-crash bugs. But always keep "never
crashes" as the floor.

```
weak  → totality (never crashes)
      → invariant on output
      → idempotence
      → metamorphic / conservation
strong→ round-trip + differential (catch silent wrong-but-doesn't-crash bugs)
```

And make sure your random inputs actually reach the situation a rule talks about. A
rule about bad input needs an input maker that produces bad input, or the rule
passes for the wrong reason — the inputs never hit the case (the QuickChick
"shadowed variable" lesson).

---

## Step 4: Build the pieces

Now build what the rules need. Reuse what already exists; build only what's missing.

The four pieces:

- **An input maker** (generator) — something that spits out endless
  random-but-valid inputs.
- **A replay button** (a seed) — save one number so the exact same run happens
  again. Pin down anything random.
- **The loop** — run an input, check every rule, record any failures.
- **Shrinking** — when a rule breaks, automatically cut the input down to the
  smallest version that still breaks it.

### The input maker

Ask "how is a _valid_ input described?" The answer picks how you make inputs. This is
the most important decision in the whole framework.

```
How are valid inputs described?               →  Generator tool to use
─────────────────────────────────────────────────────────────────────────────
A) runtime schema / reflected type            →  DERIVE it (reflection)
   (Zod, a RunType, JSON Schema)                  createMockDataFn<T>(), zod-fast-check
B) only a static TS type                       →  reflect it, or hand-write
                                                   typia random<T>(), or fc.Arbitrary<T>
C) unstructured bytes / strings                →  MUTATE a seed corpus
                                                   fc.string(), byte-flip a seed
D) a SEQUENCE of operations (stateful)         →  command / model generator
                                                   fc.commands([...]) + a model
E) two coupled artifacts that EVOLVE via       →  an EVENT generator + a state model
   edits (← the enrichment case, below)            (build it; see "A real one")
```

In plain terms:

- The program can read a schema or type at runtime → make inputs straight from it.
- You only have a written-down type → reflect it, or hand-write a small maker.
- The input is raw text or bytes → start from real samples and mess them up;
  random bytes alone rarely get past a parser.
- The code has memory (state) → make a random LIST of actions, not one input,
  because the bug only shows after a sequence.

(A) the schema IS the input maker — the RunTypes case, near-free:

```ts
// The schema IS the generator. One reflected type → infinite valid values.
import {createMockDataFn} from '@mionjs/run-types';
const mockUser = createMockDataFn<User>(); // () => User, valid by construction
const u = mockUser(); // a fresh random User every call
```

(B) hand-written maker — when you have no reflection:

```ts
import fc from 'fast-check';
const userArb: fc.Arbitrary<User> = fc.record({
  id: fc.uuid(),
  name: fc.string(), // empty strings, emoji, RTL marks — the cases you forget
  age: fc.nat({max: 120}),
  tags: fc.array(fc.string()),
});
```

(C) mess up real samples — unstructured input:

```ts
// Start from real seeds; perturb. Random bytes alone rarely get past a parser.
const seedArb = fc.constantFrom(...realSamplePayloads);
const fuzzed = seedArb.chain((s) => fc.string().map((junk) => spliceInto(s, junk)));
```

(D) code with memory — make _sequences_, not single inputs:

```ts
// A bug that only appears after a SEQUENCE of operations needs command generation.
const commands = fc.commands([fc.integer().map((v) => new PushCmd(v)), fc.constant(new PopCmd())]);
fc.assert(fc.property(commands, (cmds) => fc.modelRun(() => ({model: {len: 0}, real: new Stack()}), cmds)));
```

In this repo, three input makers already exist and cover (A), corruption, and
type-blind junk:

| Generator                        | File                                                 | Produces                                           |
| -------------------------------- | ---------------------------------------------------- | -------------------------------------------------- |
| `createMockDataFn<T>()`            | `packages/run-types/src/mocking/createMockData.ts` | a **valid** value of `T`                           |
| `mutateToInvalid(schema, valid)` | `test/fuzz/invalidValue.ts`                          | a value **corrupted at one provably-invalid spot** |
| `randomJunk(depth)`              | `test/fuzz/fuzzRunner.ts`                            | type-blind random junk (bounded, acyclic)          |

### The replay button

List everything non-deterministic the code or the input maker touches: random
numbers, `Date.now()`, the filesystem, the network, hash seeds, object key order,
`Set`/`Map` iteration order. Every one must be repeatable, or a failure can't be
reproduced and the whole loop is useless.

The repo's trick: don't thread a random generator through every call — swap
`Math.random` for a seeded one for the duration of one iteration, then restore it.

```ts
// packages/run-types/test/fuzz/seededRng.ts  (real)
export function withSeededRandom<T>(seed: number, fn: () => T): T {
  const original = Math.random;
  Math.random = mulberry32(seed); // tiny, fast, well-distributed 32-bit PRNG
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}
// mixSeed(baseSeed, label, iteration) → one uint32 so two targets never share a draw stream.
```

For anything random that isn't the random-number generator, pin it: pass a fixed
`now`, use an in-memory filesystem, sort keys before comparing. The rule: a
`Violation` must carry the single `seed` that replays it.

```ts
// packages/run-types/test/fuzz/fuzzOracle.ts  (real) — note the seed field.
export interface Violation {
  oracle: OracleId;
  target: string;
  seed: number; // ← the exact seed to replay this iteration
  phase: 'valid' | 'invalid' | 'junk' | 'compile';
  message: string;
  value: string;
}
```

### Shrinking

A raw random failure is huge and noisy. Shrinking cuts it down to the smallest input
that still fails, which is what makes a bug diagnosable.

- Using **fast-check**: shrinking is free and built in; on failure it prints the
  seed, the shrunk counterexample, and the shrink count.
- A hand-rolled harness (like this repo's): you either build a shrinker _or_ you
  make inputs conservatively so failures are already small. RunTypes corrupts exactly
  **one** position, so an O2 counterexample is already near-minimal.
- For event streams (in "A real one" below): shrinking means _drop events_ and
  _simplify each event_ — fast-check's `fc.commands` shrinks command lists for you.

### Wire the rules into the loop

Collect the rules into one place that returns a replayable `Violation`, the way
`fuzzOracle.ts` does. That `FuzzTarget` interface _is_ the contract between the input
maker and the rules:

```ts
// packages/run-types/test/fuzz/fuzzOracle.ts  (real, trimmed)
export interface FuzzTarget {
  title: string;
  schema: RunType; // drives mock + corruption (the input maker)
  validate: (v: unknown) => boolean; // SUT functions to exercise...
  getValidationErrors: (v: unknown) => unknown[];
  jsonEncode?: (v: unknown) => string | undefined;
  jsonDecode?: (s: string) => unknown;
  binaryEncode?: (v: unknown) => ArrayBuffer;
  binaryDecode?: (b: ArrayBuffer) => unknown;
}
// each check*(target, value, ctx) → Violation | null   ← one rule, one function
```

### Inventory the pieces

Fill this table. It is the output of building: what you need, what you already have,
and what's left to build.

```
Capability      Need                         Have?         Build?
──────────────────────────────────────────────────────────────────────────────
Generator       valid-input producer         ____          ____
                invalid/near-miss producer   ____          ____
Determinism     seeded RNG + injected I/O     ____          ____
Observation     value | error | files | diag  ____          ____
Shrink          minimiser or conservative gen ____          ____
Runner          iterate × seed × collect      ____          ____
```

Worked: **RunTypes value fuzzing** — every cell is "have," pointing at a real file
(`createMockDataFn` / `invalidValue.ts` / `seededRng.ts` / return+throw / one-spot
corruption / `fuzzRunner.ts`). That is why it could be stood up fast. The enrichment
pipeline (in "A real one" below) will have _gaps_ — mainly the event input maker plus
the state model — and the table is how we'll see exactly what to build.

---

## Step 5: Run it hard, and keep what breaks

Run thousands of inputs. Every time you find a break, save that smallest failing
input as an ordinary test, so the same bug can never sneak back in. A clean run after
thousands of tries is a result too: confidence you didn't have before.

---

## Already have a normal test? Grow it.

> Goal: turn an example/unit test you already have into a fuzz test — and keep both.
> Steps 1 to 4 build from a blank page; growing an existing test is the shortcut you
> reach for most of the time, because a passing example test has already paid the
> three hardest costs of a fuzz test.

An example test and a fuzz test are not rivals; they are the **same test at two zoom
levels**. The example pins one point — fast to debug, documents intent, runs in 1 ms.
The fuzz test sweeps the neighbourhood around it. You write the example **first**, on
purpose: it is the predecessor that tells you _exactly what to test and what inputs
you need_. Then you grow it.

### Every example test already contains a fuzz test's skeleton

Arrange-Act-Assert maps one-to-one onto the fuzz parts. The lift is three local
edits, nothing structural:

| Example test (Arrange-Act-Assert)      | → fuzz part          | the edit                                                       |
| -------------------------------------- | -------------------- | -------------------------------------------------------------- |
| **Arrange** a literal input / fixture  | the input maker      | _"which axis did the author freeze arbitrarily?"_ → vary it    |
| **Act**: call the SUT                  | the thing under test | **keep verbatim** — it already works                           |
| **Assert** `expect(out).toBe(literal)` | the rule (oracle)    | generalise the constant to a **relation true for every input** |

Two of the three are free: the **Act** is the boundary step 1 tells you to hunt for,
already wrapped; the **Arrange** is a hand-built _valid input_ — the thing the input
maker calls the hardest part. Only the **Assert** needs real thought.

### Read the inputs you need off the Arrange

Don't invent an input space — **widen the one the example already uses**. The fixture
names the shape and the validity bar; find the frozen axis and let it vary. The
loudest tell is a test that hardcodes **a `valid` list and an `invalid` list** — that
split literally names the **two input makers** you need:

```ts
// test/suites/validation/Atomic.test.ts → assertValidateStatic (validationAsserts.ts:119)
// the example PINS both sides by hand:
valid.forEach((v) => expect(validate(v)).toBe(true)); //   ← createMockDataFn<T>()           generates this side
invalid.forEach((v) => expect(validate(v)).toBe(false)); // ← mutateToInvalid(schema, mock)  generates this side
```

The fuzz harness reads exactly that off the example: `createMockDataFn(schema)`
replaces the hand-written `valid` array (valid by construction), and
`mutateToInvalid` (`test/fuzz/invalidValue.ts`, consumed by `fuzzRunner.ts:14`)
replaces the `invalid` array (corrupt one provably-invalid spot). A **table-driven**
example is the same story: each row is a hand-found seed, and the row dimension is
your input maker.

### Lift the check — constant to always-true rule (the only hard part)

A `toBe(constant)` is true for _this_ input only; a fuzz rule must hold for _all_.
Pick the tactic by the **shape of the check you already have**:

| The example asserts…                             | Lift it to…                                                        | Real pair in this repo                                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| a **relation** already (round-trip, idempotence) | the same relation over an input maker — _trivial_                  | `assertBinaryRoundTrip` (serializationAsserts.ts:205) → `checkBinaryStable` (fuzzOracle.ts:187)         |
| **true/false** on a hand-picked good/bad value   | two input makers + the **consistency invariant**                   | `assertGetValidationErrorsContract` (validationAsserts.ts:492) → `checkErrorsAgree` (fuzzOracle.ts:131) |
| a **constant you can recompute** (`toBe(5)`)     | a **reference rule** (differential) or a predicted-change relation | —                                                                                                       |
| a **hardcoded regression** ("this once broke")   | **fuzz the neighbourhood** of that hazard                          | `binaryEncoderResize.test.ts` (50 small encodes + 1 big) → varied-length mocks                          |

The round-trip case is the gift: `expect(decode(encode(x))).toEqual(x)` is _already_
the rule — swap the literal `x` for `createMockDataFn<T>()` and you are done. The
good/bad case is the workhorse: the example's two values become two input makers, and
the check becomes the relation that ties the code's two outputs together —
`validate(x) ⇔ getValidationErrors(x).length === 0`, true for **every** `x`
(`checkValidAccepted` / `checkInvalidRejected` / `checkErrorsAgree`,
fuzzOracle.ts:94/106/131).

> **Soundness still applies.** A constant lazily generalised to a sloppy rule will
> false-alarm under fuzzing. Run the lifted rule through the one iron rule above:
> _rule fails ⇒ a real bug_, no exceptions.

### The shared rule layer is the bridge

The lift is cheap because the rule wants to live in **one place, called from both
lanes**. The repo's `test/util/*Asserts.ts` files **are** the shared rule layer seen
from the example side: `assertValidateStatic`, `assertBinaryRoundTrip`, … each encode
one rule, and a shared normaliser (`normalizeForComparison` / `deepCloneForRoundTrip`,
equalsHelpers.ts:39) is imported by **both** `serializationAsserts.ts:11` and
`idIntegrityAsserts.ts:28`.

Today the fuzz rules **mirror** those asserts (`checkErrorsAgree` re-expresses
`assertGetValidationErrorsContract`) rather than importing them. The discipline the
lift teaches: **write the rule once, pin it with examples, sweep it with fuzz** —
factor the example's check into a helper the fuzz runner can call, so the two lanes
can never drift.

### Keep the example — it is now your regression pin and shrink floor

Growing a test **adds** one, it doesn't replace one. The original example earns its
keep three ways: the **fastest reproducer** (a known-minimal seed), **executable
documentation** of intent, and a **1 ms smoke** beside a multi-second soak. It also
sets the shrink floor — if a fuzz failure shrinks to something _simpler_ than your
example, that minimal case becomes a **new example test**. The two lanes feed each
other.

### When NOT to bother

Growing a test pays where inputs vary _and_ an always-true rule exists. It doesn't
always:

- **Pure, total transforms** — `transformAsserts.ts` (`transform(input) === expected`):
  deterministic, no error path, nothing to sweep. The examples are sufficient.
- **Inputs the input maker can't reach** — `circularGuardAsserts.ts` needs a _cyclic_
  value, which the default `createMockDataFn` rng won't produce; a naive lift would fuzz
  a space that never contains the case (the inputs never hit the case). Grow it only
  once you have an input maker that reaches it.

The test to apply: _is there an axis worth sweeping, and a relation that stays true
across it?_ Yes → grow it. No → the example already is the right tool.

---

## A tiny complete example

A 30-line fuzz test for a codec, built by finding the rules and then the pieces:

```ts
import fc from 'fast-check';
import {test} from 'vitest';
import {encode, decode} from '../src/codec';

// --- the pieces ---
// input maker: a hand-written arbitrary (no reflection here).
const userArb = fc.record({id: fc.uuid(), name: fc.string(), age: fc.nat({max: 120})});
// replay + shrink: fast-check gives seed + shrinking for free.
// what we watch: the return value.

// --- the rules ---
test('codec', () => {
  fc.assert(
    fc.property(userArb, (user) => {
      // ② round-trip (strong)
      expect(decode(encode(user))).toStrictEqual(user);
      // ③ idempotence of encode∘decode at the wire
      const w = encode(user);
      expect(encode(decode(w))).toBe(w);
    }),
    {numRuns: 1000}
  );
  // ① totality (negative space): decode must not crash on junk, only reject.
  fc.assert(
    fc.property(fc.string(), (s) => {
      try {
        decode(s);
      } catch (e) {
        expect(e).toBeInstanceOf(DecodeError);
      }
    })
  );
});
```

That is the entire framework in miniature: pick an input maker, lean on fast-check
for seed and shrink, watch the return value, and sweep rule shapes ②③①⑧. The rest of
this doc is what to do when the code under test is _not_ a simple in/out function —
like a stateful sync pipeline.

---

## A real one: the enrichment sync pipeline

> This is the framework's first user. The goal: **event-driven** fuzzing that proves
> the enrichment pipeline stays consistent under _any_ sequence of edits to either
> the source type or the generated file.
>
> Grounded in the real pipeline: CLI at [`ts-go-runtypes/cmd/mion/enrich_cli.go`](../../../ts-go-runtypes/cmd/mion/enrich_cli.go)
> (+ `enrich_reconcile.go`, `enrich_check.go`); the value-preserving merge in
> [`ts-go-runtypes/internal/enrichment/mirror/reconcile.go`](../../../ts-go-runtypes/internal/enrichment/mirror/reconcile.go);
> node shapes in [`packages/run-types/src/enrich/friendlyType.ts`](../../../packages/run-types/src/enrich/friendlyType.ts)
>
> - `mockData.ts`; comptime-args validation in
>   [`ts-go-runtypes/internal/compiler/comptimeargs/comptimeargs.go`](../../../ts-go-runtypes/internal/compiler/comptimeargs/comptimeargs.go).
>   Existing **example-based** tests
>   ([`packages/run-types/test/suites/enrich/enrichReconcile.test.ts`](../../../packages/run-types/test/suites/enrich/enrichReconcile.test.ts),
>   `enrichGen.test.ts`, `enrichCheck.test.ts`) already pin individual cases — the
>   fuzzer **generalises them to "holds for every edit sequence."**

### The problem, stated as a fuzzing problem

Two **coupled artifacts** evolve over time:

- **T** — the source TypeScript type.
- **E** — its committed enrichment sibling (`*.rt.ts`): the `FriendlyType<T>` map
  (labels + error templates) and the `MockData<T>` map (sample pools/ranges),
  scaffolded by the compiler and filled by users/LLMs.

A **pipeline P** (the `mion` CLI: `gen` / `gen --update` / `gen --prune` /
`check` / `describe`) keeps `E` consistent with `T`. **Events** mutate `T` or `E`.
The code under test is **P**, and the question is: _for any sequence of events, does
P keep T and E consistent — preserving human work, syncing real changes, and
rejecting nonsense with a clear diagnostic instead of silent corruption or a crash?_

That is a code-with-memory, predicted-change fuzzing problem — precisely the kind
naive "throw random bytes" fuzzing cannot express, and exactly what rule shapes ⑥
(predicted change), ⑦ (preservation), and ⑧ (bad input must complain) are for.

### The event surface (the input maker's alphabet)

```
Events on T (the source type)              Events on E (the generated file)
──────────────────────────────────        ─────────────────────────────────────
add a field                                fill a @todo blank
remove a field                             edit a label / error template
rename a field                             change a MockData pool/range value
change a field's type                      add a node (related → ok; UNRELATED → ?)
make a field optional / required           remove / rename a node
widen / narrow a union                     edit a comptime-args literal
add a format brand (e.g. email)            mark @rtOrphan / @rtOrphanChild
reorder fields                             reorder nodes
```

Interleaved with **commands**: `gen`, `gen --update`, `gen --prune`, `check`.

### Building the pieces for the pipeline

```
Capability    Need for this SUT                                  Have?   Build?
──────────────────────────────────────────────────────────────────────────────────
Generator     an EVENT-STREAM generator over the alphabet above   no    ✅ build
              + a MODEL of (T, E) tracking expected structure      no    ✅ build
Determinism   seeded event stream                                  yes   reuse seededRng.ts
Observation   regenerated E (text/AST) + the diagnostics list      yes   CLI already emits both
Shrink        drop/simplify events                                 yes   fc.commands shrinks for free
Runner        apply event → run command → check oracle, repeat     part  ✅ wire to a model harness
```

**The gap is the event input maker plus the (T, E) model.** Everything else reuses
what exists. The model only needs to track _enough_ to state the rules: the set of
field paths in T, which nodes in E are authored vs scaffolded (`@todo`), and which
edits were "unrelated."

### The rules for the pipeline

The checklist sweep yields a concrete rule set:

| #       | Archetype            | Rule (oracle) — with the real diagnostic codes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R1**  | ③ idempotence        | `gen --update` run twice ⇒ **byte-identical** file. No drift, no re-stamped `@todo`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **R2**  | ⑥ metamorphic        | **A single edit to T ⇒ a bounded, predictable change to E.** _add_ field → one new `@todo` scaffold node in both `friendly*` and `mock*`; _remove_ field → that node becomes an `@rtOrphanChild` carcass (authored value kept, **not** deleted); _rename_ → value carried under the new key via `@rtIds`; _retype_ → property-merged + MockData re-checked. _Local edit → local effect._                                                                                                                                                                                |
| **R3**  | ⑦ preservation       | `gen --update` **never modifies an authored leaf value**. An _unrelated_ change to T leaves every other authored label/pool byte-identical.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **R4**  | ⑤ differential       | `check` and `gen --update` agree on structure: if `check` is clean (no `FT*/MD*/GE*` error) then `--update` makes **no structural change**; a missing/extra field is seen by both.                                                                                                                                                                                                                                                                                                                                                                                      |
| **R5**  | ⑧ negative space     | Every malformed edit yields a **specific code** — never a crash, never silent accept: unrelated field → **FT002 / MD001**; bad `$errors` constraint key → **FT003**; bad `$[placeholder]` → **FT005**; bad mock pool value → **MD003**; a forbidden construct in a comptime-args `$errors` function (a call / ternary / spread / computed key / template `${}`) → **CTA003** (non-literal → CTA001, too deep → CTA002); deleted source type → **GE002**; renamed type → **GE003**. _(The precise answer to "unrelated node in comptime args → then what": **CTA003**.)_ |
| **R6**  | ③ convergence        | After `gen --update` (then `--prune`), the file is a **fixed point**: `check` passes and a second `--update` is a no-op.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **R7**  | ②⑦ orphan round-trip | _remove_ X → `--update` keeps an `@rtOrphanChild` carcass; _re-add_ X → `--update` **restores the authored value** from it. But `--prune` in between deletes the carcass, so _remove → prune → re-add_ yields a fresh empty `@todo` (value gone). Both directions must hold exactly.                                                                                                                                                                                                                                                                                    |
| **R8**  | invariant            | **`@todo` lifecycle:** emitted once on a new const; after the user deletes it, `--update` never re-adds it to an existing const, and `--prune` never removes it.                                                                                                                                                                                                                                                                                                                                                                                                        |
| **R9**  | boundary             | **Markers are compiler-owned.** `@rtType`/`@rtIds` are _outputs_, not authored content — `--update` refreshes them on structural drift, so the generator must **not** treat hand-edits to them as R3 preservation targets.                                                                                                                                                                                                                                                                                                                                              |
| **R10** | ① totality           | The walkers are depth-bounded (`maxWalkDepth`); a deep or **circular** type must produce a diagnostic or a bounded file — **never** a crash, stack overflow, or hang.                                                                                                                                                                                                                                                                                                                                                                                                   |

R2, R3, R5, and R7 are the valuable, non-obvious ones — and they are _only_
expressible because we modelled the system as events-over-coupled-artifacts.

### The test, as a model-based fuzzer (sketch)

Using fast-check command generation: each command is an event or a CLI run; the model
tracks expected `(T, E)` facts; after each command we assert the relevant R-rule.
fast-check generates and **shrinks** the event sequence for free.

```ts
import fc from 'fast-check';

// The model: just enough to state the oracles.
interface Model {
  fields: Map<string, FieldSpec>; // T's fields
  authored: Map<string, string>; // E nodes the "user/LLM" filled (path → content)
  inSync: boolean; // does check expect to pass?
}
// The real system: a temp workspace with T's source + E + the CLI (in-memory FS, seeded).
interface Real {
  workspace: Workspace;
}

class AddFieldToType implements fc.Command<Model, Real> {
  constructor(
    readonly name: string,
    readonly type: string
  ) {}
  check = (m: Model) => !m.fields.has(this.name);
  run(m: Model, r: Real) {
    r.workspace.editType(add(this.name, this.type));
    m.fields.set(this.name, {type: this.type});
    m.inSync = false; // T moved, E stale
  }
}

class RunUpdate implements fc.Command<Model, Real> {
  check = () => true;
  run(m: Model, r: Real) {
    const before = r.workspace.authoredContent();
    const diff = r.workspace.run('gen', '--update'); // the SUT
    r.workspace.run('gen', '--prune');
    // R2 metamorphic: the diff touches ONLY nodes for changed fields.
    expectDiffLocalTo(diff, changedFieldsSince(m));
    // R3 preservation: unrelated authored content is byte-identical.
    expect(r.workspace.authoredContentFor(unrelated(m))).toEqual(before.forUnrelated);
    // R6 convergence: now check passes.
    expect(r.workspace.run('check').ok).toBe(true);
    m.inSync = true;
  }
}

class InjectForbiddenComptimeArg implements fc.Command<Model, Real> {
  // user/LLM puts a non-literal (fn call, ternary, spread, computed key, `${}`)
  // into an inline `$errors` function — the comptime-args literal slot.
  check = () => true;
  run(_m: Model, r: Real) {
    r.workspace.editEnrichment(injectForbiddenConstructIntoErrorsFn());
    const diags = r.workspace.run('check').diagnostics;
    // R5: a SPECIFIC code fires — never a crash, never silent.
    expect(diags.some((d) => d.code === 'CTA003' || d.code === 'CTA001')).toBe(true);
  }
}

class InjectUnrelatedField implements fc.Command<Model, Real> {
  check = () => true;
  run(_m: Model, r: Real) {
    r.workspace.editEnrichment(addKey('totallyUnrelated', {pool: []}));
    const diags = r.workspace.run('check').diagnostics;
    expect(diags.some((d) => d.code === 'FT002' || d.code === 'MD001')).toBe(true); // R5
  }
}

class RunCheckVsUpdate implements fc.Command<Model, Real> {
  check = () => true;
  run(_m: Model, r: Real) {
    const checkSaysInSync = r.workspace.run('check').ok; // R4 differential
    const updateChangedNothing = r.workspace.run('gen', '--update').isEmpty;
    expect(checkSaysInSync).toBe(updateChangedNothing);
  }
}

test('enrichment sync stays consistent under any edit sequence', () => {
  const cmds = fc.commands(
    [
      fc.tuple(fc.string(), fc.constantFrom('string', 'number', 'User')).map(([n, t]) => new AddFieldToType(n, t)),
      fc.constant(new RunUpdate()),
      fc.constant(new InjectForbiddenComptimeArg()),
      fc.constant(new InjectUnrelatedField()),
      fc.constant(new RunCheckVsUpdate()),
      /* RemoveField, RenameField, RetypeField, FillTodo, RunPrune, OrphanRoundTrip(R7), … */
    ],
    {maxCommands: 40}
  );
  fc.assert(
    fc.property(cmds, (run) => {
      fc.modelRun(() => ({model: freshModel(), real: freshWorkspace()}), run);
    }),
    {numRuns: 300}
  );
  // every failure prints the seed + the shrunk minimal event sequence that broke a rule.
});
```

### What this buys us

A failing run won't say "something's off." It will say: _"seed 0xC0FFEE: after
`addField('x') → gen --update → renameField('y','z') → gen --update`, node `z`'s
authored label was lost (R3)"_ — already shrunk to the minimal sequence. That is the
difference between fuzzing the pipeline and hoping.

### First run — what we learned (we were the first testers)

Implemented in [`packages/run-types/test/fuzz/enrich/`](../../../packages/run-types/test/fuzz/enrich/):
`enrichCli.ts` (non-throwing CLI wrappers), `enrichModel.ts` (the model + the
event/oracle command set), `enrichFuzzRunner.ts` (seeded driver + prefix shrinker),
`enrichFuzz.integration.test.ts` (the spec). Built in the repo's own **dependency-free**
seeded-harness style (reusing `test/fuzz/seededRng.ts`), not fast-check (not a
dependency here) — the `fc.commands` sketch above is illustrative of the shape. Run
it: `pnpm run fuzz:enrich` (soak: `pnpm run fuzz:enrich:soak`).

**Result: green** across thousands of CLI invocations (30 sequences × 14 events, and
40 × 16) — every rule R1–R10 held, zero false alarms. A deliberate **negative
control** (assert a bogus code) confirmed the negative-space probes truly execute and
the harness reports + shrinks:

```
[R5] unknownMockField (step 0): expected MD999; check returned [MD001]
Minimal reproducer — seed 0xe6650f23, 1 event
```

Two things the framework surfaced **only because we ran it** — both about step 1,
what you can see (_the channel you observe through decides which rules you can
express_):

1. **`check` is the wrong instrument for the comptime-args case.** The precise answer
   to _"a non-literal node inside a comptime-args `$errors` function → then what?"_:
   it is policed at **build/transform time** as **CTA001/002/003**, NOT by `check` —
   `check` deliberately treats a function-form `$errors` as opaque and walks past it
   ([`ts-go-runtypes/internal/enrichment/validate.go`](../../../ts-go-runtypes/internal/enrichment/validate.go)). **MD003**
   (pool value vs field type) is build-time too. So a _check-driven_ fuzzer expresses
   R5 for **FT002 / FT005 / MD001** (unknown field, bad placeholder, unknown mock
   field) but **cannot** see CTA/MD003 — those need a second, build-driven harness.
   _The channel you observe through bounds your rule set._
2. **`check` silently returns zero findings when the type can't resolve.** A mirror
   whose `mion` import doesn't resolve (e.g. a fixture placed _outside_ the
   workspace) makes the validator walk nothing and report clean — so a mislocated
   harness makes every negative-space rule **pass for the wrong reason**. That is the
   "your random inputs must reach the situation a rule talks about" trap, one level
   up; the negative control above is how we caught it.

Both are folded back into the implementation and this doc — which is the point of
being the first tester.

---

## Make it a skill

The framework is deliberately a fixed sequence of steps with worksheet outputs, so it
maps onto a `.claude/skills/fuzzy-testing/` skill:

```
.claude/skills/fuzzy-testing/
  SKILL.md         # when-to-use + the five steps as a runnable checklist
  worksheet-A.md   # Build the pieces (Step 4): the input maker / replay / loop / shrink + inventory
  worksheet-B.md   # What should always be true (Step 3): the rule-shape sweep + where-each-came-from + soundness
  worksheet-C.md   # Grow an existing test: the recipe to extend an example test into a fuzz test
  templates/
    oracle-layer.ts   # FuzzTarget-style skeleton (adapted from fuzzOracle.ts)
    seeded-runner.ts  # runFuzz/runForDuration skeleton (adapted from fuzzRunner.ts)
    model-based.ts    # fc.commands skeleton for stateful/event SUTs (the "A real one" shape)
```

**Skill procedure (what the skill tells the agent to do):**

1. **Name what you're testing, and what you can see** (Step 1) — find the smallest
   callable boundary; wrap side effects; list every output you can watch.
2. **Gut-check whether fuzzing fits** (Step 2) — can you loop it, force repeatable
   runs, and tell right from wrong cheaply? If not, stop.
3. **Find the rules** (Step 3) — sweep all eight rule shapes; keep the ones that fit;
   note where each came from; pass the one iron rule (break the output on purpose and
   watch the rule catch it); gather the rules in one place. _(If an example test
   already exists, **grow it** instead — it yields the input maker and the rule
   straight from the test you already wrote.)_
4. **Build the pieces** (Step 4) — fill the inventory table; build only the gaps; seed
   every iteration; collect replayable `Violation`s.
5. **Run it hard, keep what breaks** (Step 5) — run autonomously; for each finding,
   shrink, then commit the minimal reproducer as a regression test.

**Acceptance for the skill:** it produces (a) an inventory of the pieces, (b) a set of
rules with at least one strong rule plus the never-crashes floor, (c) a seeded runner,
and (d) at least one pinned counterexample _or_ a clean soak — for whatever code it's
pointed at. The enrichment pipeline above is its first acceptance run.

---

## In one paragraph

Fuzzing throws a flood of random inputs at one piece of code and checks a rule that
should hold for every one of them; the bug is whatever breaks the rule. Five steps:
first **name what you're testing and what you can watch it do**, because what you can
see limits what you can check; then **gut-check whether fuzzing even fits** (can you
loop it, force repeatable runs, and tell right from wrong without re-doing the work?);
then **find the rules** by sweeping eight common shapes (never crashes, do-it-then-undo-it,
twice-is-once, a fact that's always true, agrees with a trusted second source,
predicted change, unrelated change leaves the rest alone, bad input must complain) and
make every rule sound by breaking the output on purpose first; then **build the
pieces** (an input maker, a replay seed, the loop, a shrinker), reusing what exists;
then **run it hard and pin every failure** as a regression test. The shortcut when an
example test already exists: keep its call, turn its fixture into an input maker and
its check into an always-true rule, and share one rule layer between the example and
fuzz lanes. Applied to the **FriendlyType/MockData sync pipeline**, these steps turn
"keep the files consistent" into a concrete event-stream model-based fuzzer with
consistency rules R1–R10 — implemented, green across thousands of runs, and packaged
as a reusable skill.
