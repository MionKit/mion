---
name: delegate-finding
description: Hand an unrelated finding to a parallel background session with its own todo, branch and PR. Use when work turns up a bug or gap off the current task's path.
---

# delegate-finding

Use [the tool mapping](../TOOLS.md) for assistant-specific calls and fallbacks.

Hand an unrelated finding to a parallel agent, keeping the main task's session focused. The output of this skill is: a filed guidelines todo, a pushed stable commit, a running background session the user can steer, and a recorded merge-order dependency (finding's PR before the main task's PR).

Related findings are NOT delegated — they are fixed in the current task and PR (see the findings rule in [AGENTS.md](../../../AGENTS.md)). Delegate only what is genuinely off the current task's code path.

**Delegation is one level deep.** Only a session the user started directly may run this skill. A delegated session (its prompt names a parent session) never spawns another one:

- It fixes every finding it meets in its own PR. A fix often has more than one cause, so a second issue on the same feature counts as related.
- A finding that is clearly unrelated becomes a guidelines todo (the [create-todo skill](../create-todo/)), committed in its own PR, and is named in its PR description and final message. It never opens a session for it.

## The flow

1. **Surface it first.** Tell the user in your reply: what the finding is, where it came from, whether it predates your change (bisect if cheap). Delegation never replaces surfacing.

2. **File it as a GUIDELINES todo** with the [create-todo skill](../create-todo/) — guidelines mode, not a full plan: capture the evidence, the repro, and the intent, and leave the real planning to the implementing agent (implement-todo plans before coding anyway). The doc lands in `docs/todos/`.

3. **Pin a stable commit.** Commit your current work state plus the new todo doc on YOUR branch and push. This is the handoff point: the background session starts from this commit, so it sees the todo and the exact tree that exposed the finding. Don't hand off from a dirty or unpushed tree.

4. **Spawn the background session.** It MUST be a session the user can inspect,
   reply to, and steer. Follow the background-session section of the tool mapping.
   Start from the stable commit in step 3 in the Mion environment, with
   `https://github.com/MionKit/mion` as the source. An internal subagent does not
   satisfy this requirement. If session creation is unavailable or requires
   additional user authorization, report that before proceeding with this step.

5. **Instruct the child** with a standalone prompt; it starts with no parent context.
   Obtain a real parent-session link or identifier from the host; never invent one.
   Template:

   > You are fixing an unrelated issue delegated from parent session <parent link or id>.
   > The spec is `docs/todos/<file>.md` at stable commit <sha> on <branch>.
   > Create a NEW branch from `origin/main`, carry the spec with
   > `git checkout <stable-sha> -- docs/todos/<file>.md`, and run the implement-todo
   > skill through implementation, PR readiness, moving the spec to `docs/done/`,
   > and a green PR. Your PR contains only this fix, none of the parent's changes.
   > Link the parent in the PR description. You are a delegated session: fix other
   > related issues here and never start another session. Record a clearly unrelated
   > issue as a guidelines todo in this PR and name it in the PR description.

6. **Record the ordering and keep working.** The finding's PR merges BEFORE the main task's PR — state that dependency in the main PR's description and don't merge the main PR past it; the main PR waiting is the forcing function that keeps the parallel fix from stalling. After the finding's PR merges, rebase your branch on `main` and drop your `docs/todos/` copy of the spec (it now lives in `docs/done/`).

## Gotchas

- Cloud child sessions cannot message the parent session back — track progress through the child's PR and the sessions list, not by waiting for a ping.
- If the child's init fails with "Setup script failed", the session was created without a source checkout — archive it and respawn with the repo + revision attached.
- One finding, one session, one PR. Several findings at once means several delegations, not one omnibus fix branch.
