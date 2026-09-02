---
name: create-todo
description: Turn a rough request or idea into a well-formed todo doc under docs/todos/. Use this whenever the user wants to create, add, file, log, capture, jot down, or write up a todo — note something to do later, record a bug or feature idea for the backlog, or turn a discovered issue into a tracked spec — even when they just say "let's note this down" or "add a todo for X". It captures the request, classifies it (fix / feature / docs / chore), asks whether to write a full ready-to-build plan or just guidelines for the implementer, investigates to the matching depth, and — after you approve — writes the doc with a standard metadata header that the implement-todo skill later reads. It never implements the change; its only output is the todo doc. This is the complement to implement-todo — reach for it whenever something should be remembered as a docs/todos/ item rather than done right now.
---

# create-todo

Capture a request as a clean, self-contained spec under `docs/todos/` — the same directory `implement-todo` picks work from. Your output is **one markdown doc**, never a code change. The doc always opens with the shared metadata header (below), and its body is either a **full, ready-to-build plan** or **light guidelines** that leave the real planning to whoever implements it later. Which of those you write is the user's call, and guidelines is the usual answer.

**The gate: nothing is written to disk until the user approves the drafted todo.** Everything up to that point — capturing, classifying, investigating — is analysis. Present the todo you intend to file, get a yes, then write the file. If you are not already in plan mode, enter it (EnterPlanMode) once the request is captured, so the investigation stays read-only and the approval is explicit.

## The shared metadata header (contract with implement-todo)

Every todo this skill writes starts with YAML frontmatter. Two fields are load-bearing — `implement-todo` reads them to decide how to treat the todo — and two are conventional:

```yaml
---
type: feature       # fix | feature | docs | chore   — the kind of work
spec: guidelines    # full-plan | guidelines          — how complete this doc is
status: ready       # ready | blocked | ...           — conventional
created: 2026-07-22 # absolute date (today)           — conventional
---
```

- **`type`** — `fix` (corrects wrong behavior), `feature` (new capability), `docs` (documentation only), or `chore` (refactor / tooling / infra with no user-facing behavior change).
- **`spec`** — `full-plan` means the body is a complete plan an implementer can build from directly; `guidelines` means the body is direction and intent, and the implementer must investigate and plan before building. Get this right: it is exactly the switch `implement-todo` flips on.

## The arc

1. **Capture** the request — the idea and the *why*.
2. **Classify** the `type` — decide it yourself; ask only if genuinely unsure.
3. **Ask** the user: full plan, or guidelines? (Usually guidelines.)
4. **Investigate** to the matching depth — superficial for guidelines, planner-grade for a full plan.
5. **Present** the drafted todo for approval (the plan tool).
6. **Write** the doc to `docs/todos/<slug>.md` with the header + body.

## Step 1 — Capture the request

Get the intent and the reason behind it, not just a restatement. A good todo tells a future reader *why this is worth doing*, so if the user gave you only a terse line ("dedup the union guard"), draw out the missing "why" and any constraints they already have in mind. Keep it short; you are recording a request, not solving it yet.

Before going further, glance at whether this already exists: a quick look across `docs/todos/`, `docs/done/`, and `docs/maybe/` for the same topic. If there's a match, surface it rather than filing a duplicate — the user may want to reopen or extend the existing one instead.

## Step 2 — Classify the type

Decide `type` from the request yourself — that is the default. `fix` vs `feature` vs `docs` vs `chore` is usually obvious from what the user described. Only when it is genuinely ambiguous (e.g. "improve X" that could be a bug fix or a new capability) ask with **AskUserQuestion**. State the classification you landed on when you summarize.

## Step 3 — Ask: full plan or guidelines?

This one is always the user's choice, so ask it with **AskUserQuestion** — and lead with guidelines, because that is the common case and the whole point of the two-skill split: capture direction now, let the implementer do the deep planning at build time with fresh context.

- **Guidelines** (usual) — you record intent + direction; `implement-todo` investigates and plans later.
- **Full plan** — you do the deep planning now and write a spec ready to build from.

If you already had to ask the `type` question in step 2, fold both into a single AskUserQuestion call rather than asking twice.

## Step 4 — Investigate to the matching depth

The depth is the difference between the two paths. Match it to what the user chose:

**Guidelines — superficial, just enough to be correct.** Your goal is an *accurate, actionable pointer*, not a solution. Verify the premise holds so you don't file a todo built on a false assumption: confirm the problem is real (or the feature makes sense), that the files / functions / symbols you name actually exist and are roughly where you say (a couple of quick greps), and that nothing obvious makes the idea a dead end. Then stop. Do **not** design the solution, enumerate edge cases, or write a test plan — that is deliberately left for the implementer, who will have to re-derive the current state anyway. Over-investigating here wastes the work twice.

**Full plan — planner-grade, like the Plan agent.** Do the deep work now: read the relevant code, pin the exact call sites (`file:line`), design the approach, enumerate the concrete changes, the test plan (which layer, what it pins, both `getRunTypeId` shapes if the marker API is involved — see [CLAUDE.md](../../../CLAUDE.md)), the docs impact, and — for a feature — whether it is a fuzzing candidate (a cheap oracle like round-trip, determinism, or compare-to-a-trusted-source). Draw the **Out of scope** line explicitly and a concrete **Done when**. Spawn an **Explore** agent for breadth or a **Plan** agent for the approach when the surface is large. The aim is that `implement-todo` can later build from your doc with minimal re-investigation.

## Step 5 — Present the todo for approval

Show the user the exact todo you intend to file — frontmatter and body — with the **plan tool (ExitPlanMode)**. For a full plan this is the planner-grade content; for guidelines it is the short version. The user can amend the type, the spec choice, the direction, or the wording before anything hits disk. Fold in their edits and re-present if they change it. Do not write the file until they approve.

## Step 6 — Write the doc

On approval, write `docs/todos/<slug>.md`, where `<slug>` is a short kebab-case name from the title (check it doesn't collide with an existing file). Use today's date (absolute) for `created`, matching the existing todos' convention. Follow this shape:

```markdown
---
type: <fix | feature | docs | chore>
spec: <full-plan | guidelines>
status: ready
created: <YYYY-MM-DD>
---

# <Concise title>
```

Then the body, sized to the `spec`:

- **Guidelines** — keep it lean:
  - `## Intent` — what and why.
  - `## Direction` — the rough approach plus the pointers/constraints you verified; state plainly that the implementer plans the details.
  - `## Done when` — the acceptance bar, roughly.
- **Full plan** — mirror the shape of the existing full-plan specs (`docs/todos/first-unified-release.md`, `docs/done/unified-type-dependency-invalidation.md`):
  - `## Problem`, `## Plan` (or `## Fix direction`) with `file:line` pointers, `## Tests`, `## Docs`, `## Fuzzing` (if a feature), `## Out of scope`, `## Done when`.

Close by telling the user where you filed it and, if they want, that they can pick it up any time with `implement-todo`.

## What NOT to do

- **Do not implement anything.** This skill writes exactly one file — the todo doc. If the user actually wants the work done now, that is `implement-todo`, not this.
- **Do not write the file before approval.** Steps 1-5 are analysis; the doc lands only after a yes.
- **Do not over-investigate a guidelines todo.** Superficial-but-correct is the target; deep planning is the implementer's job and doing it here duplicates the work.
- **Do not omit or guess the header fields.** `type` and `spec` are the contract `implement-todo` runs on — a missing or wrong `spec` sends the implementer down the wrong path.
- **Do not file a duplicate.** If the topic already lives in `docs/todos/` (or done/maybe), surface it instead.
- **Do not answer the skill's own AskUserQuestion for the user** — the spec choice is theirs.

## Gotchas

- **`spec: guidelines` is the common case, not a lesser one.** The design intent is to capture direction cheaply and let the implementer plan with fresh context. Reach for `full-plan` only when the user wants the thinking done up front.
- **This is where `implement-todo`'s found-a-bug follow-ups land.** When an implementer surfaces an out-of-scope issue, filing it as a todo means this exact shape — usually a `fix`-type, `guidelines`-spec doc.
- **The date must be today's, written absolutely** (`2026-07-22`, not "today") — relative dates rot.
- **Slugs should read like the title.** `seeded-mock-data.md`, not `todo-3.md` — the filename is how the user recognizes it in the `implement-todo` picker.
