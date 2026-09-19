---
name: implement-todo
description: Build a docs/todos/ spec end to end, from an approved plan to the gate, docs/done/ and the docs simplification pass. Use when the user wants to implement or pick a todo.
---

# implement-todo

Take one spec from `docs/todos/` and carry it to a finished, PR-ready change. The specs in that directory range from full plans (Problem / Plan / Tests / Done-when with real `file:line` pointers) to loose pointers and open questions. Your job is to figure out which kind you have, fill any gaps, and get an **approved plan** before touching code — then build it to the spec's own "Done when" bar.

**The one hard gate: no file edits until the user has approved a plan via the plan tool.** Everything in steps 1-6 is reading, investigating, and asking — analysis only. Implementation (step 7) starts only after approval. If you are not already in plan mode, enter it (EnterPlanMode) after the todo is chosen so the invariant holds by construction and your clarifying questions read as planning.

## The arc

1. **Pick** the todo (AskUserQuestion, unless the user already named one).
2. **Read** it fully and **summarize** it back to the user.
3. **Classify** from the metadata `spec`: a ready-to-build plan, or guidelines you must plan from?
4. **Decide** the tests / docs / fuzzing obligations.
5. **Refine** open questions with the user (only if investigation left forks).
6. **Present the plan** for approval — always, even for a complete spec.
7. **Implement** to the plan and the spec's Done-when.
8. **Gate + finish**: tests green, docs updated, the spec reconciled with what actually shipped, then `git mv` into `docs/done/`.
9. **Documentation simplification**: the `docs-simplifier` subagent runs the simplify-docs skill over every page and example this change touched. Always, never by you.

## Step 1 — Pick the todo

The source is **`docs/todos/*.md` only**. The sibling dirs are not candidates: `docs/done/` is finished, `docs/maybe/` is parked and deliberately not ready. Ignore `.gitkeep`.

- **If the user already named a todo** — a filename, a path under `docs/todos/`, or an unambiguous description ("the union guard dedup one") — skip the question, confirm which file you landed on, and move to step 2.
- **Otherwise ask with AskUserQuestion.** AskUserQuestion caps at 4 options, and there are often more todos than that, so: first list **every** todo in prose (one line each — filename, a one-line gist, and its status if the file states one like `READY`), then offer a curated set as options (prefer the `READY`/next-release ones) with "Other" covering the rest of the listed set. That way the user sees the full menu even though only a few are one-click.

## Step 2 — Read it fully, then summarize

Start with the **metadata header**. Todos written by `create-todo` open with YAML frontmatter carrying `type` (`fix` | `feature` | `docs` | `chore`) and `spec` (`full-plan` | `guidelines`) — those two fields drive everything downstream, so read them first.

**The header is optional.** Older todos, and anything filed by hand, may not have one. When it is missing, derive what it *should* be — `type` and `spec` from the doc's prose (its Status line and shape), plus `status`/`created` — and plan to **write that header back into the file** so the next run reads it directly instead of re-deriving. That write happens after approval, alongside the other doc edits in step 7; nothing is written before the plan is approved.

Then read the whole file, following enough of its internal `file:line` pointers to actually understand the change (these specs cite the exact functions to touch). Give the user a short summary:

- **What** the todo is and **what kind** it is — take the kind from `type`, or infer it: a bug fix, a feature, a docs change, or a chore/refactor.
- Its **status**, and — if present — its own **Done when** and **Out of scope** sections. Those are gold: they set the acceptance bar and the boundaries the author already drew. Honor them; do not silently widen scope past an explicit "Out of scope".

## Step 3 — Classify: ready-to-build plan, or guidelines to plan from?

The metadata `spec` field is the signal — it is the switch `create-todo` set when the todo was filed:

- **`spec: full-plan`** — the body is a complete plan (concrete Problem / Plan / Tests / Done-when, real file pointers). Plan directly from it; just confirm the cited `file:line` locations are still current, since code drifts.
- **`spec: guidelines`** — the body is direction and intent only, and the deep planning was deliberately left to you. Investigate now: read the referenced code, grep for the real call sites, and for anything broad spawn an **Explore** agent (to map the surface) or a **Plan** agent (to design the approach). Resolve the unknowns so your plan rests on facts, not guesses.
- **No header (older todos)** — judge from the shape instead: a full Problem/Plan/Tests/Done-when with real pointers reads as `full-plan`; a loose pointer or a list of "figure out X" reads as `guidelines`.

Either way you will present a plan in step 6 — the `spec` only decides **how much digging precedes it**.

## Step 4 — Decide the tests / docs / fuzzing obligations

The header's `type` orients this: a `fix` or `feature` always needs tests, a `docs` todo may need none, and only a `feature` gets the fuzzing check. Work the specifics while planning.

**Tests — required for every fix and every feature.** This is a rule, not a judgment call: the repo's PR-readiness gate does not accept an untested fix or feature. Work out the layer while planning:
- JS/plugin change → Vitest (`.spec.ts` / `.test.ts`) under `packages/`.
- Go change → `go -C ts-go-runtypes test ./internal/...`.
- Marker API (`getRunTypeId`, the `createX` factories) → cover **both** call shapes (static `getRunTypeId<T>()` and value-first `getRunTypeId(value)`) per the Marker test coverage rule in [ts-go-runtypes/CLAUDE.md](../../../ts-go-runtypes/CLAUDE.md).
- A pure docs or chore todo may legitimately have no code test — say so explicitly rather than skipping silently.

**Docs — decide when the answer is clear, ask when it is not.** A new or changed feature almost always needs docs: the website (`container/website/content/`). A fix usually needs docs only if it changes documented behavior. If you cannot tell whether a change is user-visible enough to document, **ask** (AskUserQuestion). Name the page AND the placement in the plan: an existing section (which one) or a new section, decided with the *Where a change goes* table in [container/website/CLAUDE.md](../../../container/website/CLAUDE.md). When you write it, follow the ideal section template there and the language rules in the *Website Documentation* section of [CLAUDE.md](../../../CLAUDE.md), and read the wrong / right pairs in [the simplify-docs skill](../simplify-docs/examples.md) first. The simplification pass in step 9 is the check on that, not a substitute for it.

**Fuzzing — for features, judge candidacy, then propose.** RunTypes has a real property-test harness (`packages/run-types/test/fuzz/`, run via `pnpm miondevx core fuzz <suite>`), and many features here have a cheap correctness oracle that makes fuzzing pay off. Quickly gut-check the feature for one:
- **round-trip** (an encode/decode or serialize/parse pair should return the value),
- **do-it-twice / determinism** (same input, same output — a seeded mock-data generator is a textbook determinism-fuzz candidate),
- **compare-to-a-trusted-source** (one implementation checked against another, the way the binary codec oracles the JSON codec),
- **reject-bad-input** (malformed input is always rejected, never mis-accepted).

If the feature has one of these, **propose fuzzing with AskUserQuestion and get a yes before baking it into the plan** — do not add it unilaterally, and do not design the fuzzer here. Hand the actual design off to the **fuzzy-testing** skill, which drives the discovery properly. If nothing gives a cheap oracle, say so and move on; talking a feature out of fuzzing is a fine outcome.

## Step 5 — Refine open questions (only if needed)

If investigation (step 3) or the docs/fuzzing decisions (step 4) left genuine forks — a design choice the spec did not settle, an ambiguity the code does not answer — resolve them with the user now, one focused AskUserQuestion at a time. Do not ask what you can determine yourself by reading the code; ground every question in what you found.

## Step 6 — Present the plan for approval (always)

Present the plan with the **plan tool (ExitPlanMode)**, even when the todo was already a complete spec — the user gets to amend before any code is written. The plan should state, concisely:

- the change you will make (and the key files, from the spec's own pointers),
- the **test** plan (layer + what the tests will pin, both marker shapes if applicable),
- the **docs** plan (which page, and existing section or new section; or an explicit "no docs needed because …"),
- the **fuzzing** decision (proposed + confirmed, or "not a fuzz candidate because …"),
- the **finish**: run the gate, then `git mv` the spec into `docs/done/`.

Mirror the todo's own **Done when** so approval is measured against the author's bar. Wait for approval. If the user amends, fold it in and re-present.

## Step 7 — Implement (after approval only)

- **Branch check first.** The repo lands work on a feature branch, never `main` (see the Git workflow in [CLAUDE.md](../../../CLAUDE.md)). If you are on `main`, create a branch before editing.
- **Record the plan in the todo doc before building:**
  - **Backfill a missing header.** If step 2 found no frontmatter, write the derived `type` / `spec` / `status` / `created` block to the top of the file now, so the doc is normalized for the next run and for the `docs/done/` archive.
  - **For a `guidelines` todo, append the approved plan** as a new section at the **bottom** of the doc (e.g. `## Plan — <label> (approved <date>)`). Guidelines todos start with only direction, so recording the plan you actually got approved means the doc carries the real, built plan when it eventually lands in `docs/done/`. Repeated passes **append** rather than overwrite, so a todo implemented in stages accumulates its full history. (A `full-plan` todo already carries its plan in the body — don't re-append; you reconcile it in step 8.)
- Build to the plan and the spec's **Done when**, respecting its **Out of scope**.
- Mind the build discipline: rebuild `mion-bin/mion` after any Go edit before `pnpm test`, and rebuild `@mionjs/devtools` after any of its src edits (consumers read its dist). Details in [CLAUDE.md](../../../CLAUDE.md).
- **An issue surfaces mid-implementation? Tell the user, then see it solved.** CLAUDE.md requires every finding to end up fixed or genuinely tracked toward a fix, never merely recorded, so never let one live only in chat.
  - **Related** — it sits on the same code path, or the todo's fix is incomplete or wrong without it. Fix it here; that is the ideal, a clean fix rather than a half one that spawns a follow-up.
  - **Unrelated** — delegate it to a parallel background agent via the [delegate-finding skill](../delegate-finding/): guidelines todo, stable commit, background session in the Mion cloud environment, own branch and own PR — merged BEFORE this todo's PR.
  - **Genuinely cannot land now in either lane** (needs an upstream release, or a decision only the user can make)? File a `docs/todos/` spec with the evidence and a concrete fix plan, and tell the user it is still work owed rather than work closed out.
  - **Needs a decision you cannot make alone?** Ask the user in this session and carry out the answer.

## Step 8 — PR-readiness gate, then finish

Run the gate before calling it done:

- **Tests green** — `pnpm test` for JS (rebuild the binary first), plus `go -C ts-go-runtypes test ./internal/...` for Go changes. If you added a fuzz suite, run it.
- **Lint + format** — `pnpm run lint` and `pnpm run format` (never hand-format).
- **Docs updated** per the plan.
- **Reconcile the spec with what shipped.** If the implementation diverged from the original todo — a different approach, a narrower or wider outcome, a decision the spec did not anticipate — edit the todo file so it describes what was **actually built** before it moves. A stale spec landing in `docs/done/` misleads the next reader.
- **Move the spec.** `git mv` it from `docs/todos/` into `docs/done/` and update it to match what shipped. This is a hard PR-readiness requirement, not an afterthought. If you deliberately shipped only PART of it, SPLIT rather than park: the moved doc records what landed and why the rest was cut, and the remainder becomes a NEW `docs/todos/` spec that reads on its own. There is no half-done lane.

## Step 9 — Documentation simplification (always, by a subagent)

The last step before the change is PR ready, and it runs even when the docs change is one sentence. It is a subagent pass on purpose: this session knows why every sentence exists and will defend it, and that is exactly how the complex wording gets through. A fresh context reads the page the way its reader will.

1. List what the branch touched: `git diff --name-only $(git merge-base origin/main HEAD)..HEAD -- container/website/content packages/examples/src`. Nothing listed means the step is a no-op; say so and stop here.
2. Spawn the agent with the Agent tool, `subagent_type: docs-simplifier`, and give it those paths (or "the branch"). Do not run the skill yourself, and do not tell the agent why a sentence is there. If the tool answers that the type is not found (agent definitions load at session start), spawn `general-purpose` instead with the body of `.claude/agents/docs-simplifier.md` as the prompt plus the instruction to read `.claude/skills/simplify-docs/SKILL.md` first; same paths, same rules.
3. Read its report. For every rewrite, check the new sentence against the code: a simplification that dropped a condition, a code, a default or a limit is wrong, so restore the fact in plain words. Decide every **Left alone** and **Flagged** line yourself: rewrite it, keep it, or move the section.
4. Re-run what the pass can break: `pnpm run typecheck` (the examples) and `pnpm exec vitest run website-links` (renamed anchors).
5. Commit the pass on its own: `docs(simplify): <page>`.

Close by telling the user what shipped versus the todo's Done-when, and flag anything you consciously left for a follow-up.

## What NOT to do

- **Do not skip the simplification pass, and do not run it in this session.** Even a one-sentence docs change goes through the `docs-simplifier` subagent. The one exception is a branch that touched no page and no example.

- **Do not edit any file before the plan is approved.** Steps 1-6 are analysis only.
- **Do not skip tests on a fix or a feature** — the gate rejects it and so should you.
- **Do not add fuzzing without asking**, and do not hand-roll the fuzzer — route to the fuzzy-testing skill.
- **Do not pull candidates from `docs/done/` or `docs/maybe/`** — only `docs/todos/` holds ready work.
- **Do not exceed the todo's stated Out-of-scope**, and do not leave the spec sitting in `docs/todos/` after you finish it.
- **Do not accept a simplification that changed a fact.** The subagent's report is reviewed against the code, sentence by sentence, before it is committed.
- **Do not let an *unrelated* issue end as a filed-and-forgotten spec** — delegate it via the [delegate-finding skill](../delegate-finding/) (parallel agent, own PR, merged before this todo's PR); a spec is only for what truly cannot land in either lane, and it is a commitment to finish, not a way to close the loop.
- **Do not let a diverged spec move unchanged** — if what shipped differs from the plan, update the todo to reflect reality before `git mv`-ing it to `docs/done/`.
- **Do not reference a todo or done doc from any other file.** Not from docs, skills, workflows or code comments: those specs get deleted eventually. Write the reasoning where it is needed; if a spec lists documents that may go stale after merge, that list lives in the spec itself.
- **Do not answer the skill's own AskUserQuestion for the user** — this skill is interactive by design; it needs the human's choices.

## Gotchas

- **AskUserQuestion only shows up to 4 options.** With more todos than that, list them all in prose and make the options a curated subset plus "Other" — otherwise the user cannot pick the ones you dropped.
- **A "full spec" still goes through the plan tool.** Being already-planned by the author is not the same as approved by the user; present it anyway.
- **The plan gate protects you.** Entering plan mode after selection means investigation and questions cannot accidentally mutate files, and the user sees exactly what you intend before you build it.
- **Specs cite exact `file:line` locations** that drift as the code moves. Treat them as strong hints, but confirm the current location before editing.
- **A missing header is not a blocker.** Derive `type`/`spec` from the prose, backfill it after approval, and carry on. For a `guidelines` todo, **append** the approved plan at the bottom — never overwrite the original direction; the doc is meant to accumulate what got built so `docs/done/` shows the full history.
