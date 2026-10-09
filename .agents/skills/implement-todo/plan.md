# Planning: steps 1-6

Analysis only. No file edits until step 6 approval.

## Step 1 - Pick the todo and the mode

Source: `docs/todos/*.md` ONLY. `docs/done/` = finished, `docs/maybe/` = parked, not ready. Ignore `.gitkeep`.

- User named one (filename, path under `docs/todos/`, unambiguous description like "the union guard dedup one")
  → skip the question, confirm which file you landed on, go to step 2.
- Ask the mode (automatic / manual) in the same question round, or its own if user named the todo.
- Otherwise ask with the question tool. Respect its option limit; often more todos than options:
  - First list EVERY todo in prose: filename, one-line gist, status if the file states one (`READY`).
  - Then a curated set as options (prefer `READY` / next-release), free-text covers the rest (else they're unpickable).

## Step 2 - Read fully, then summarize

- Start with the metadata header. `create-todo` todos open with YAML frontmatter:
  `type` (`fix` | `feature` | `docs` | `chore`) and `spec` (`full-plan` | `guidelines`). These drive everything.
- Header optional: older or hand-filed todos may lack one. Missing → not a blocker:
  - derive `type` + `spec` from prose (Status line, shape), plus `status` / `created`;
  - plan to write that header back (step 7, after approval) so the next run reads it directly.
- Read the whole file. Follow enough `file:line` pointers to understand the change.
- Specs cite exact `file:line` locations that drift: strong hints, confirm current location before editing.
- Summarize to user:
  - **What** it is + **what kind** (`type`, or inferred: bug fix, feature, docs, chore/refactor).
  - Its **status**, and its **Done when** + **Out of scope** if present: they set the acceptance bar + boundaries.
    Never silently widen scope past an explicit "Out of scope".

## Step 3 - Classify

Metadata `spec` (set by `create-todo`) is the switch. It decides how much digging precedes the step 6 plan:

- **`spec: full-plan`**: complete plan (Problem / Plan / Tests / Done-when, real pointers). Plan from it.
- **`spec: guidelines`**: direction + intent only; deep planning left to you. Investigate now:
  read referenced code, grep real call sites. Plan rests on facts, not guesses.
  Anything broad → spawn an independent research/planning agent (tool mapping).
- **No header**: judge from shape. Full Problem/Plan/Tests/Done-when with real pointers = `full-plan`;
  loose pointer or "figure out X" list = `guidelines`.

## Step 4 - Tests / docs / fuzzing

`type` orients: `fix` / `feature` always need tests, `docs` may need none, only `feature` gets the fuzzing check.

**Tests: required for every fix + feature.** A rule: PR-readiness gate rejects an untested fix or feature. Layer:

- JS/plugin change → Vitest (`.spec.ts` / `.test.ts`) under `packages/`.
- Go change → `go -C ts-go-runtypes test ./internal/...`.
- Marker API (`getRunTypeId`, the `createX` factories) → BOTH call shapes:
  static `getRunTypeId<T>()` and value-first `getRunTypeId(value)`.
  Marker test coverage rule: [ts-go-runtypes/AGENTS.md](../../../ts-go-runtypes/AGENTS.md).
- Pure docs/chore todo may have no code test: say so explicitly, never skip silently.

**Docs: decide when clear, ask when not.**

- New/changed feature almost always needs docs: website (`container/website/content/`).
- Fix needs docs only if it changes documented behavior. Unsure if user-visible enough → ask (question tool).
- Plan names page AND placement: existing section (which) or new, via *Where a change goes* list in
  [container/website/AGENTS.md](../../../container/website/AGENTS.md).
- Writing it: ideal section template there.
  Language rules: *Website Documentation* in [AGENTS.md](../../../AGENTS.md).
  Read the wrong / right pairs in [the simplify-docs skill](../simplify-docs/examples.md) first.
  Step 10 simplification checks this; it is not a substitute.

**Fuzzing: features only, judge candidacy, then propose.**
Harness: `packages/run-types/test/fuzz/`, run via `pnpm miondevx core fuzz <suite>`. Gut-check for a cheap oracle:

- **round-trip**: encode/decode or serialize/parse pair returns the value.
- **do-it-twice / determinism**: same input, same output (seeded mock-data generator = textbook case).
- **compare-to-a-trusted-source**: one implementation vs another (slow reference interpreter oracles compiled clone).
- **reject-bad-input**: malformed input always rejected, never mis-accepted.

Has one → propose with the question tool, get a yes before it enters the plan. Never add unilaterally.
Never design the fuzzer here: hand design to the **fuzzy-testing** skill.
No cheap oracle → say so, move on (talking a feature out of fuzzing is fine).

## Step 5 - Refine open questions (only if needed)

- Steps 3-4 left real forks (design choice spec did not settle, ambiguity code does not answer)?
  Resolve with the user now, one focused question at a time.
  Never ask what reading the code answers. Ground every question in what you found.

## Step 6 - Present the plan (always)

Use the approval workflow in [the tool mapping](../TOOLS.md), even for a complete spec:
authored by the author ≠ approved by the user. User may amend before any code. Plan states, concisely:

- the change + key files (from the spec's pointers);
- **test** plan: layer + what tests pin, both marker shapes if applicable;
- **docs** plan: page + existing or new section, or explicit "no docs needed because …";
- **fuzzing** decision: proposed + confirmed, or "not a fuzz candidate because …";
- **finish**: run the gate, then `git mv` the spec into `docs/done/`.

Mirror the todo's **Done when** (approval measured against the author's bar). Wait. Amended → fold in, re-present.
