---
name: fuzzy-testing
description: Add a fuzz or property test, rules first. Use when adding a fuzz test or a unit test over random inputs.
---

# Fuzzy testing: guide the user through it

Use [the tool mapping](../TOOLS.md) for assistant-specific calls and fallbacks.

Use when helping add a fuzz / property test, or proposing one for a good candidate.
Job: guide a short discovery, not recite a method. End with: rules worth checking, tools to check them, a running test.

- Fuzz test = flood of random inputs, one rule (oracle) checked on every output. Bug = whatever breaks the rule.
- Parts: input maker (generator) → code under test → what you can see (observation) → rule (oracle).
- Seed = one saved number that replays a run exactly. Shrinking = cut a failing input to its smallest form.
- The two hard parts: (1) inputs the code accepts, (2) knowing when an output is wrong. Never "randomise bytes".
- User brings domain knowledge (what "correct" means). You bring method, repo digging, writing. You drive.

## How to run it

- Investigate before you ask: read the code, grep tests + input makers, see how it is called. Bring findings.
- Grounded questions only ("you have `encode` + `decode`: should decode(encode(x)) give x back?").
  Never blank ones ("what are your invariants?").
- One focused question at a time. Guide, don't interrogate.
- Iterate, above all on rules (step 3) and tools (step 4): propose a few, user confirms / corrects, refine, repeat.
- Every rule + tool points at something real: their code, an existing test, a stated promise, a past bug.
- Hold the line on soundness: red test = real bug. Prove each rule by breaking the output on purpose.

## Start here: new test, or grow an existing one?

1. Ask first, before anything else:
   > Do you want to **define a new fuzz test from scratch**, or do you **already have a test (or one specific
   > behaviour or bug) we can use as the starting point**?
2. Existing test / concrete behaviour → [grow-test.md](references/grow-test.md) first, then steps 4 + 5.
   It hands you step 1 + a first cut of step 3 for free.
3. New (code only, no test) → steps 1 to 5 in order.
4. Unsure which → grep for tests that already exercise this code, bring them back.
- Steps 1-3 = conversation + investigation. Steps 4-5 = building.

## Step 1: What you test, what you can see

- Steer to the smallest thing callable directly. Wrap side effects so they come back as a value.
- List every output you can watch, confirm with the user nothing is missing. Rules only check what you see.
- Land on one callable boundary with a watchable output. Detail → [scope.md](references/scope.md).

## Step 2: Worth fuzzing?

- Gut-check out loud: loop it fast? repeatable or forceable? cheap right/wrong check?
  Detail → [scope.md](references/scope.md#step-2-worth-fuzzing).
- Any no → say so, suggest hand-written examples. Talking them OUT of fuzzing is part of the job.

## Step 3: Discover the rules (the heart, iterate)

- Harvest assertions from existing tests. Walk the rule shapes with the user, in their terms. Loop.
- Most code fits 3 to 5 shapes. Ground each rule (spec, past bug, guess). Drop the guesses.
- ⚠️ Iron rule: red = real bug. Break the output on purpose, watch each rule fire (negative control). Non-negotiable.
- Detail, shape checklist, repo oracles → [rules.md](references/rules.md).

## Step 4: Inventory tools, build only the gaps (iterate)

- Look before you build: grep for input maker, seeded RNG, runner, shrinker. Report what exists, never rebuild it.
- Repo has `createMockDataFn`, `mutateToInvalid`, `randomJunk`, `withSeededRandom` / `mixSeed`.
- Pick the input maker with the user by how a valid input is described: [input-makers.md](references/input-makers.md).
- Seed, shrinking, loop, gap table: [replay-and-loop.md](references/replay-and-loop.md).
- Wire the step-3 rules into the loop with the templates below.

## Step 5: Run it hard, pin what breaks

- Run thousands of inputs. Each failure → shrink to smallest input → SAVE as an ordinary regression test.
- Show the user that minimal reproducer: the most convincing thing you produce.
- Clean run over thousands of tries is a result too: tell the user the confidence they gained.

## Templates to adapt

- [`templates/oracle-layer.ts`](templates/oracle-layer.ts): all rule-checks in one place, each → failure record or null.
- [`templates/seeded-runner.ts`](templates/seeded-runner.ts): replayable loop, run-it-a-lot mode, shrinker.
- [`templates/model-based.ts`](templates/model-based.ts): code with memory, a sequence of actions per input.
- No extra libraries (no fast-check here). fast-check, if present, can replace loop + shrinker; rule-checks stay.

## Examples

- Whole method in 30 lines (codec): [codec-example.md](references/codec-example.md).
- Pipeline case: [enrich-pipeline.md](references/enrich-pipeline.md), [enrich-fuzzer.md](references/enrich-fuzzer.md).

## Done when you and the user have

- A clear boundary + what you can observe. Inventory of the pieces (have / build).
- Rules written down: at least one strong rule + the "doesn't crash" floor. Each grounded, proven by a negative control.
- A runner replayable from a seed.
- At least one saved failing input, or a clean run over thousands of inputs.
- Reference: the enrichment fuzzer (`packages/run-types/test/fuzz/enrich/`).
