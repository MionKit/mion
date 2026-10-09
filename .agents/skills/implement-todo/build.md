# Build: steps 7-8

After plan approval only.

## Step 7 - Implement

- **Branch check first.** Work lands on a feature branch, never `main` (Git workflow, [AGENTS.md](../../../AGENTS.md)).
  On `main` → create a branch before editing.
- **Record the plan in the todo doc before building:**
  - **Backfill missing header**: step 2 found none → write derived `type` / `spec` / `status` / `created` block
    at the top now, normalized for the next run and the `docs/done/` archive.
  - **`guidelines` todo → append the approved plan** as a new section at the BOTTOM
    (e.g. `## Plan: <label> (approved <date>)`), so the doc carries the real built plan into `docs/done/`.
    Repeated passes append, never overwrite: a staged todo accumulates its full history.
  - `full-plan` todo: plan is already the body. Never re-append; reconcile it in step 8.
- Build to the plan + spec's **Done when**, respecting its **Out of scope**.
- Build discipline: rebuild `mion-bin/mion` after any Go edit before `pnpm test`; rebuild `@mionjs/devtools`
  after any of its src edits (consumers read its dist). Details in [AGENTS.md](../../../AGENTS.md).

### Issue surfaces mid-implementation

Tell the user, then see it solved. Never let one live only in chat (AGENTS.md: fixed or tracked toward a fix).

- **Related** (same code path, or the todo's fix is incomplete/wrong without it) → fix here. Ideal: clean fix,
  not a half one that spawns a follow-up.
- **Unrelated** → [delegate-finding skill](../delegate-finding/): own todo, branch, PR, merged BEFORE this todo's PR.
  This session was itself delegated (prompt names a parent session)? Never delegate: guidelines todo via
  create-todo, committed in this PR, named in the PR description.
- **Cannot land now in either lane** (needs an upstream release, or a decision only the user can make)?
  File a `docs/todos/` spec with evidence + concrete fix plan. Tell the user: still work owed, not closed out.
- **Decision you cannot make alone?** Manual: ask the user here, carry out the answer.
  Automatic: choose the safer, smaller option, record it for the final message.

## Step 8 - PR-readiness gate, then finish

- **Tests green**: `pnpm test` for JS (rebuild the binary first), plus `go -C ts-go-runtypes test ./internal/...`
  for Go changes. Added a fuzz suite → run it.
- **Lint + format**: `pnpm run lint` and `pnpm run format` (never hand-format).
- **Docs updated** per the plan.
- **Reconcile the spec with what shipped.** Diverged (other approach, narrower/wider outcome, unforeseen decision)?
  Edit the todo to describe what was ACTUALLY built before it moves. Stale spec in `docs/done/` misleads.
- **Move the spec**: `git mv` from `docs/todos/` into `docs/done/`. Hard PR-readiness requirement.
  Shipped only PART → SPLIT, never park: moved doc records what landed + why the rest was cut;
  remainder = NEW `docs/todos/` spec that reads on its own. No half-done lane.
