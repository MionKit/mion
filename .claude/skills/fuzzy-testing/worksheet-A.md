# Step 4: The tools you'll need

> You're settling what's being tested and then building only the tools the rules need: an
> input maker, a replay button (a seed), the loop, and a shrinker. This worksheet also
> covers step 1 (what you're testing and what you can see) and step 2 (is it worth it?),
> since you settle those with the user first. The rule throughout: look before you build,
> and build only the gaps. Full prose:
> [framework-fuzzy-testing.md → Step 4](framework-fuzzy-testing.md#step-4-build-the-pieces).

## Step 1 · Name the code and bound it (with the user)

- Ask the user for the smallest function or pipeline you can call directly in a test.
  Read it; write its signature down.
- If it touches the outside world (CLI, server, filesystem), wrap that boundary so you
  can call it like a plain function: `run(args, files) -> {stdout, exit, files,
diagnostics}`. Keep wrapping until it's clean and you can call it a million times.
- Land on one thing: the code under test as `(In) -> Out` (smaller means faster runs and
  a sharper rule).

## Step 1 · Work out what you can see

- List everything you can watch the code do: the return value, any error it throws (and
  the error's type), stdout / exit code, files it writes, a list of diagnostics. Tell the
  user what you found.
- The more you can see, the stronger the rules can be. See enough to tell "clean" apart
  from "never ran". Example: a validator that returns 0 findings _because the type failed
  to resolve_ looks identical to "valid", and that blind spot makes a reject-bad-input
  rule pass for the wrong reason.

## Step 2 · Check it's worth fuzzing (ask the user)

Run the three-question check with the user before building anything:

- Can we run the code over and over, fast, in a loop?
- Is it repeatable, or can we force that (no loose randomness, clock, or network you
  can't pin down)?
- Is there a cheap way to tell right from wrong without redoing its work? Ask straight:
  "if I hand you an output, how would you spot a wrong one without re-running the logic?"

If any answer is no, stop and recommend a few hand-written examples instead.

## Step 4 · Pick the input maker with the user (the most important decision)

Ask: **how is a _valid_ input described?** That answer picks the approach. Propose one
from the table and confirm with the user.

| Valid inputs are described by…               | Input maker                                                                   |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| a schema / type the program reads at runtime | **DERIVE** inputs from it (reflection): `createMockDataFn<T>()`, zod-fast-check |
| only a written-down TS type                  | reflect it, or hand-write a small maker (`fc.Arbitrary<T>` / typia)           |
| raw text / bytes                             | **MUTATE** real samples, splice junk into known-good inputs                   |
| a SEQUENCE of operations (code with memory)  | make a random LIST of actions + a small model of the state                    |
| two coupled things that EVOLVE via edits     | make a random list of EDIT events + a small model (build it)                  |

- Look first: does the input maker already exist? This repo has `createMockDataFn<T>()` (a
  valid value), `mutateToInvalid(schema, valid)` (one spot that is provably wrong),
  `randomJunk(depth)` (type-blind junk). Report what's there before building anything.

## Step 4 · A replay button (the seed)

- List **every** source of randomness the code or the input maker touches: the random
  number generator, `Date.now()`, the filesystem, network, hash seeds, `Object` key
  order, `Set` / `Map` iteration order.
- Make each one replayable from a single saved number (a seed). Repo trick:
  `withSeededRandom(seed, fn)` swaps `Math.random` for a seeded generator for one run,
  then restores it; `mixSeed(base, label, i)` makes a fresh seed per run.

## Step 4 · Shrinking a failure

- Decide how you'll cut a failing input down to its smallest form. fast-check does this
  automatically. By hand, the options are: **smallest-prefix** (the fewest first-K
  actions that still fail, what the enrich fuzzer uses), **drop-subsets** (remove chunks
  and see if it still fails), **simplify-the-value** (shrink the input itself). Always
  keep the **seed** alongside the shrunk reproducer.

## Fill the gap list with the user (the hand-off)

Fill this in together, then build only what's **missing**.

| Part             | Tool (existing or to build) | Exists? | Missing |
| ---------------- | --------------------------- | ------- | ------- |
| input maker      |                             |         |         |
| seed / replay    |                             |         |         |
| what you can see |                             |         |         |
| shrinking        |                             |         |         |

You should already have the rules from [the rules worksheet (worksheet-B.md)](worksheet-B.md),
or be coming from [grow an existing test (worksheet-C.md)](worksheet-C.md) if an example
test already exists.
