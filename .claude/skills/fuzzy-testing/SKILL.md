---
name: fuzzy-testing
description: Guide someone through adding a fuzz / property test to their code, the structured way — you investigate their repo, ask focused questions, and iterate until you both have the rules worth checking and the tools to check them. Decide WHAT must always be true before building any tooling. Use when adding a fuzz test, a property test, or any test that throws lots of random inputs at the code; when generalising one example/unit test into a test that runs over many inputs; when deciding what rules to check (round-trip, do-it-twice, compare-to-a-trusted-source, predicted-change, leave-the-rest-alone, reject-bad-input); when testing code with memory by feeding it a sequence of actions (model-based / sequence testing); or when hunting edge cases your hand-written tests miss. Grounded in this repo's real harness (packages/ts-runtypes/test/fuzz/) with the FriendlyText/MockData sync fuzzer as the worked example.
---

# Fuzzy testing — guide the user through it

Use this when you're helping someone add a fuzz / property test, or you've spotted a
good candidate and want to propose one. Your job is to **guide a short discovery**,
not to recite a method at them. You investigate their repo, ask focused questions, and
iterate until the two of you have: the rules worth checking, the tools to check them,
and a running test.

Who does what: **the user** brings domain knowledge (what "correct" means for their
code). **You** bring the method, the digging through their codebase, and the writing.
You drive.

How to run it:

- **Investigate before you ask.** Read the code, grep for existing tests and input
  generators, look at how the code is called. Come to the user with findings, then ask.
  Blank questions ("what are your invariants?") waste their time; grounded ones
  ("you have `encode` and `decode` — should decoding an encode give the value back?")
  move fast.
- **One focused question at a time.** Guide, don't interrogate.
- **Iterate — especially the rules (step 3) and the tools (step 4).** You will not get
  the full list in one pass. Propose a few candidates from what you found, let the user
  confirm or correct, refine, then come back for more.
- **Stay grounded.** Every rule and tool you propose should point at something real:
  their code, an existing test, a stated promise, a past bug.
- **Hold the line on soundness.** Keep reminding the user: a red test must mean a real
  bug. You'll prove each rule by breaking the output on purpose and watching it fire.

## Start here: are we defining something new, or growing an existing test?

Your first move, before anything else, is to ask the user this one question:

> Do you want to **define a new fuzz test from scratch**, or do you **already have a
> test (or one specific behaviour or bug) we can use as the starting point**?

An existing test is the best possible start — it hands you the boundary (step 1) and a
first cut of the rules (step 3) for free. So route on their answer:

- **They point you at an existing test** (or a concrete behaviour they want pinned down):
  do the **[shortcut](worksheet-C.md)** first to grow it, then finish with steps 4 and 5.
- **It's new** (they only have code, no test yet): walk steps 1 to 5 in order.

If you're not sure which they have, go look: grep for tests that already exercise this
code, and bring what you find back to them. Either way, steps 1–3 are conversation and
investigation; steps 4–5 are building.

## Step 1: Pin down what you're testing, and what you can see

- Ask the user which piece of code they want to trust more. Steer them to the smallest
  thing you can call directly — smaller means faster runs and sharper rules.
- Read it. Note its signature. Work out how it's reached: a plain function, a CLI, a
  server, the filesystem? If it has side effects, plan a thin wrapper that hands them
  back as a value (`run(input) -> {result, files, diagnostics}`).
- Work out what you can observe: return value, thrown errors, files written, logs, exit
  code, diagnostics. Tell the user what you found and confirm nothing's missing — the
  rules can only check what you can see.
- Land on one agreed thing: a callable boundary with a watchable output.

## Step 2: Decide together if it's even worth fuzzing

Run the three-question gut-check out loud with the user:

- Can we run it over and over, fast, in a loop? (You can usually tell from the code.)
- Is it repeatable, or can we force that? (Scan for clocks, randomness, network.)
- **Is there a cheap way to tell right from wrong without redoing its work?** Ask the
  user straight: "if I hand you an output, how would you spot a wrong one without
  re-running the logic?" This question kills most bad candidates.

If any answer is no, say so plainly and suggest a few hand-written examples instead.
Talking someone _out_ of fuzzing when it doesn't fit is part of the job.

## Step 3: Discover the rules — iterate (this is the heart)

A back-and-forth, not a form you fill once. Use [worksheet-B.md](worksheet-B.md) as your
prompt list.

- **Harvest first.** Grep for existing example/unit tests of this code. Their assertions
  are candidate rules already — pull them out and bring them to the user.
- **Walk the rule shapes with the user.** For each shape on the checklist, ask a pointed
  question grounded in their code ("should running this twice change nothing the second
  time?", "what inputs are illegal here, and what should happen?"). Propose the rule in
  their terms; let them confirm or correct it.
- **Loop.** Offer a few, get reactions, refine, come back for the rest. Stop when you've
  covered the shapes that fit — most code has three to five.
- **Ground each rule.** Ask where it comes from: a spec, a past bug, or a guess. Drop
  the guesses; an invented rule is the main cause of false alarms.
- **Set up the iron rule now.** Tell the user plainly: a red test must always mean a
  real bug, so before you trust a rule you will break the output on purpose and watch it
  fire (the negative control). This habit is non-negotiable.

## Step 4: Inventory the tools, build only the gaps — iterate

Use [worksheet-A.md](worksheet-A.md) and the templates.

- **Look before you build.** Grep the repo for what already exists: an input maker /
  mock generator, a seeded random source, a test runner, a shrinker. In THIS repo:
  `createMockDataFn`, `mutateToInvalid`, `randomJunk`, `withSeededRandom` / `mixSeed`.
  Report what's there so you don't rebuild it.
- **Pick the input maker with the user**, based on what describes a valid input (the
  table in worksheet-A). Propose, confirm, adjust.
- **Fill the gap list together**, build only what's missing, and wire the step-3 rules
  into the loop (templates: oracle-layer, seeded-runner, model-based).

## Step 5: Run it hard, and pin what breaks

- Run thousands of inputs. For each failure, shrink to the smallest input and SAVE it as
  an ordinary test — show the user that minimal reproducer; it's the most convincing
  thing you'll produce.
- A clean run over thousands of tries is also a result. Tell the user what confidence
  they now have that they didn't before.

## Shortcut — already have a normal test? Grow it.

Use [worksheet-C.md](worksheet-C.md). If example tests exist, start there: widen the
test's input into the input maker, and lift its check (true for one input) into a rule
(true for all inputs). You get steps 1 and 3 mostly for free. Keep the original test as
the fast reproducer.

## Templates to adapt

- [`templates/oracle-layer.ts`](templates/oracle-layer.ts) — gather the rule-checks in
  one place, each returning a replayable failure record or nothing.
- [`templates/seeded-runner.ts`](templates/seeded-runner.ts) — the replayable loop, a
  run-it-a-lot mode, and a shrinker.
- [`templates/model-based.ts`](templates/model-based.ts) — for code with memory:
  generate a sequence of actions instead of one value.

No extra libraries needed (this repo has no fast-check). If fast-check is available it
can replace the loop and the shrinker; the rule-checks stay the same.

## You're done when you and the user have

A clear boundary and what you can observe; the rules written down (at least one strong
rule plus the "doesn't crash" floor), each one grounded and proven by a negative
control; a runner you can replay from a seed; and at least one saved failing input, or a
clean run over thousands of inputs. The enrichment fuzzer
(`packages/ts-runtypes/test/fuzz/enrich/`) is the reference.
