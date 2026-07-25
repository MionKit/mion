---
name: implement-todo
description: Drive a docs/todos/ spec from selection all the way to a shipped change. Use this whenever the user wants to implement, work on, pick, start, tackle, or "do" a todo — anything under docs/todos/ — whether they name a specific spec ("implement the seeded-mock-data todo", or a path in docs/todos/) or ask you to choose one ("let's do a todo"). It lists the open todos and asks which to do, summarizes it, decides whether it is a ready-to-build spec or needs investigation first, works out the required tests / docs / fuzzing, and presents a plan for approval via the plan tool BEFORE writing any code — then implements it, runs the PR-readiness gate, and moves the spec into docs/done/. Reach for it even when the request is as vague as "pick something off the todo list".
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

## Step 1 — Pick the todo

The source is **`docs/todos/*.md` only**. The sibling dirs are not candidates: `docs/done/` is finished, `docs/partially/` is mid-flight, `docs/maybe/` is parked and deliberately not ready. Ignore `.gitkeep`.

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

- **`spec: full-plan`** — the body is a complete plan (concrete Problem / Plan / Tests / Done-when, real file pointers). Plan directly from it; just confirm the cited `file:line` locations are still current, since code drifts. `seeded-mock-data.md` and `union-validate-dedup-object-guard.md` are the shape.
- **`spec: guidelines`** — the body is direction and intent only, and the deep planning was deliberately left to you. Investigate now: read the referenced code, grep for the real call sites, and for anything broad spawn an **Explore** agent (to map the surface) or a **Plan** agent (to design the approach). Resolve the unknowns so your plan rests on facts, not guesses.
- **No header (older todos)** — judge from the shape instead: a full Problem/Plan/Tests/Done-when with real pointers reads as `full-plan`; a loose pointer or a list of "figure out X" (like `oxc-migration-followups.md`) reads as `guidelines`.

Either way you will present a plan in step 6 — the `spec` only decides **how much digging precedes it**.

## Step 4 — Decide the tests / docs / fuzzing obligations

The header's `type` orients this: a `fix` or `feature` always needs tests, a `docs` todo may need none, and only a `feature` gets the fuzzing check. Work the specifics while planning.

**Tests — required for every fix and every feature.** This is a rule, not a judgment call: the repo's PR-readiness gate does not accept an untested fix or feature. Work out the layer while planning:
- JS/plugin change → Vitest (`.spec.ts` / `.test.ts`) under `packages/`.
- Go change → `go -C ts-go-runtypes test ./internal/...`.
- Marker API (`getRunTypeId`, the `createX` factories) → cover **both** call shapes (static `getRunTypeId<T>()` and value-first `getRunTypeId(value)`) per the Marker test coverage rule in [CLAUDE.md](../../../CLAUDE.md).
- A pure docs or chore todo may legitimately have no code test — say so explicitly rather than skipping silently.

**Docs — decide when the answer is clear, ask when it is not.** A new or changed feature almost always needs docs: the website (`container/website/content/`), and `docs/ARCHITECTURE.md` / `docs/ROADMAP.md` when it changes what they describe (a flag, the execution model, scope, a lossy mapping). A fix usually needs docs only if it changes documented behavior. If you cannot tell whether a change is user-visible enough to document, **ask** (AskUserQuestion). When you do touch website content, follow the house voice (plain, user-focused, no em/en-dashes; prefer `<code-import>` examples) — see the Website docs style section in [CLAUDE.md](../../../CLAUDE.md).

**Fuzzing — for features, judge candidacy, then propose.** RunTypes has a real property-test harness (`packages/ts-runtypes/test/fuzz/`, run via `pnpm rtx core fuzz <suite>`), and many features here have a cheap correctness oracle that makes fuzzing pay off. Quickly gut-check the feature for one:
- **round-trip** (an encode/decode or serialize/parse pair should return the value),
- **do-it-twice / determinism** (same input, same output — e.g. the `seeded-mock-data` todo is a textbook determinism-fuzz candidate),
- **compare-to-a-trusted-source** (one implementation checked against another, the way the binary codec oracles the JSON codec),
- **reject-bad-input** (malformed input is always rejected, never mis-accepted).

If the feature has one of these, **propose fuzzing with AskUserQuestion and get a yes before baking it into the plan** — do not add it unilaterally, and do not design the fuzzer here. Hand the actual design off to the **fuzzy-testing** skill, which drives the discovery properly. If nothing gives a cheap oracle, say so and move on; talking a feature out of fuzzing is a fine outcome.

## Step 5 — Refine open questions (only if needed)

If investigation (step 3) or the docs/fuzzing decisions (step 4) left genuine forks — a design choice the spec did not settle, an ambiguity the code does not answer — resolve them with the user now, one focused AskUserQuestion at a time. Do not ask what you can determine yourself by reading the code; ground every question in what you found.

## Step 6 — Present the plan for approval (always)

Present the plan with the **plan tool (ExitPlanMode)**, even when the todo was already a complete spec — the user gets to amend before any code is written. The plan should state, concisely:

- the change you will make (and the key files, from the spec's own pointers),
- the **test** plan (layer + what the tests will pin, both marker shapes if applicable),
- the **docs** plan (which files, or an explicit "no docs needed because …"),
- the **fuzzing** decision (proposed + confirmed, or "not a fuzz candidate because …"),
- the **finish**: run the gate, then `git mv` the spec into `docs/done/`.

Mirror the todo's own **Done when** so approval is measured against the author's bar. Wait for approval. If the user amends, fold it in and re-present.

## Step 7 — Implement (after approval only)

- **Branch check first.** The repo lands work on a feature branch, never `main` (see the Git workflow in [CLAUDE.md](../../../CLAUDE.md)). If you are on `main`, create a branch before editing.
- **Record the plan in the todo doc before building:**
  - **Backfill a missing header.** If step 2 found no frontmatter, write the derived `type` / `spec` / `status` / `created` block to the top of the file now, so the doc is normalized for the next run and for the `docs/done/` archive.
  - **For a `guidelines` todo, append the approved plan** as a new section at the **bottom** of the doc (e.g. `## Plan — <label> (approved <date>)`). Guidelines todos start with only direction, so recording the plan you actually got approved means the doc carries the real, built plan when it eventually lands in `docs/done/`. Repeated passes **append** rather than overwrite, so a todo implemented in stages accumulates its full history. (A `full-plan` todo already carries its plan in the body — don't re-append; you reconcile it in step 8.)
- Build to the plan and the spec's **Done when**, respecting its **Out of scope**.
- Mind the build discipline: rebuild `bin/ts-runtypes` after any Go edit before `pnpm test`, and rebuild `ts-runtypes-devtools` after any of its src edits (consumers read its dist). Details in [CLAUDE.md](../../../CLAUDE.md).
- **An issue surfaces mid-implementation? Decide related vs. unrelated, and either way tell the user.** CLAUDE.md requires the tell-and-file for out-of-scope findings, so never let one live only in chat.
  - **Related** — it sits on the same code path, or the todo's fix is incomplete or wrong without it. Fix it as part of this change; that is the ideal, a clean fix rather than a half one that spawns a follow-up. If the related fix is distinct enough to deserve its own record, file a `docs/todos/` spec for it and move that into `docs/done/` when it lands with this change.
  - **Unrelated** — file it as a new spec under `docs/todos/` (evidence + a fix direction) and **leave it there**. Do not widen the current task to chase it.

## Step 8 — PR-readiness gate, then finish

Run the gate before calling it done:

- **Tests green** — `pnpm test` for JS (rebuild the binary first), plus `go -C ts-go-runtypes test ./internal/...` for Go changes. If you added a fuzz suite, run it.
- **Lint + format** — `pnpm run lint` and `pnpm run format` (never hand-format).
- **Docs updated** per the plan.
- **Reconcile the spec with what shipped.** If the implementation diverged from the original todo — a different approach, a narrower or wider outcome, a decision the spec did not anticipate — edit the todo file so it describes what was **actually built** before it moves. A stale spec landing in `docs/done/` misleads the next reader.
- **Move the spec.** `git mv` it from `docs/todos/` into `docs/done/` (or `docs/partially/` if you deliberately shipped only part of it). This is a hard PR-readiness requirement, not an afterthought.

Close by telling the user what shipped versus the todo's Done-when, and flag anything you consciously left for a follow-up.

## What NOT to do

- **Do not edit any file before the plan is approved.** Steps 1-6 are analysis only.
- **Do not skip tests on a fix or a feature** — the gate rejects it and so should you.
- **Do not add fuzzing without asking**, and do not hand-roll the fuzzer — route to the fuzzy-testing skill.
- **Do not pull candidates from `docs/done/`, `docs/partially/`, or `docs/maybe/`** — only `docs/todos/` holds ready work.
- **Do not exceed the todo's stated Out-of-scope**, and do not leave the spec sitting in `docs/todos/` after you finish it.
- **Do not chase an *unrelated* issue inline** — file it as a new `docs/todos/` spec and leave it; only issues genuinely related to the current fix fold into this change.
- **Do not let a diverged spec move unchanged** — if what shipped differs from the plan, update the todo to reflect reality before `git mv`-ing it to `docs/done/`.
- **Do not answer the skill's own AskUserQuestion for the user** — this skill is interactive by design; it needs the human's choices.

## Gotchas

- **AskUserQuestion only shows up to 4 options.** With more todos than that, list them all in prose and make the options a curated subset plus "Other" — otherwise the user cannot pick the ones you dropped.
- **A "full spec" still goes through the plan tool.** Being already-planned by the author is not the same as approved by the user; present it anyway.
- **The plan gate protects you.** Entering plan mode after selection means investigation and questions cannot accidentally mutate files, and the user sees exactly what you intend before you build it.
- **Specs cite exact `file:line` locations** that drift as the code moves. Treat them as strong hints, but confirm the current location before editing.
- **A missing header is not a blocker.** Derive `type`/`spec` from the prose, backfill it after approval, and carry on. For a `guidelines` todo, **append** the approved plan at the bottom — never overwrite the original direction; the doc is meant to accumulate what got built so `docs/done/` shows the full history.
