---
name: delegate-finding
description: Delegate an UNRELATED finding to a parallel background agent so the main task keeps moving. Use whenever work surfaces a bug, doc drift, or gap that is NOT on the current task's code path — the findings rule in CLAUDE.md says such a finding is never backlogged or fixed inline; it is handed to a background session the user can watch and steer. This skill drives the whole handoff: file the finding as a guidelines todo (create-todo), pin a stable commit on the current branch, spawn a background session in the Mion cloud environment from that commit, and instruct it to fix the finding on its own branch and PR via implement-todo — with the finding's PR merged BEFORE the main task's PR.
---

# delegate-finding

Hand an unrelated finding to a parallel agent, keeping the main task's session focused. The output of this skill is: a filed guidelines todo, a pushed stable commit, a running background session the user can steer, and a recorded merge-order dependency (finding's PR before the main task's PR).

Related findings are NOT delegated — they are fixed in the current task and PR (see the findings rule in [CLAUDE.md](../../../CLAUDE.md)). Delegate only what is genuinely off the current task's code path.

## The flow

1. **Surface it first.** Tell the user in your reply: what the finding is, where it came from, whether it predates your change (bisect if cheap). Delegation never replaces surfacing.

2. **File it as a GUIDELINES todo** with the [create-todo skill](../create-todo/) — guidelines mode, not a full plan: capture the evidence, the repro, and the intent, and leave the real planning to the implementing agent (implement-todo plans before coding anyway). The doc lands in `docs/todos/`.

3. **Pin a stable commit.** Commit your current work state plus the new todo doc on YOUR branch and push. This is the handoff point: the background session starts from this commit, so it sees the todo and the exact tree that exposed the finding. Don't hand off from a dirty or unpushed tree.

4. **Spawn the background session.** It MUST be a session the user can peek at, reply to, and steer — a cloud session in their sessions list (claude.ai/code / the Claude Code app) or a local [agent view](https://code.claude.com/docs/en/agent-view) session. For cloud sessions:
   - Environment: the **Mion cloud environment** (the one named "Mion" — it carries the mion + mion setup scripts).
   - Source: `https://github.com/MionKit/mion`, revision = your branch at the stable commit. **A session with no source dies at init** — the environment's setup script needs a checkout.

5. **Instruct the child** (its prompt must be standalone — it starts with zero context). Template:

   > You are fixing a finding delegated from another session. The spec is `docs/todos/<file>.md` on this checkout. Create a NEW branch cut from `origin/main` (e.g. `fix/<finding>`), carry the spec onto it with `git checkout <stable-sha> -- docs/todos/<file>.md`, then run the **implement-todo skill** on that spec end to end: plan, implement, PR-readiness gate, move the spec to `docs/done/`, push, and open a PR. Your PR must contain ONLY the finding's fix — none of the parent branch's in-flight work.

   The new branch is cut from `origin/main` (not from the stable commit) so the finding's PR carries only the fix; the stable-commit checkout exists to give the child the todo and the context, not to be its PR base.

6. **Record the ordering and keep working.** The finding's PR merges BEFORE the main task's PR — state that dependency in the main PR's description and don't merge the main PR past it; the main PR waiting is the forcing function that keeps the parallel fix from stalling. After the finding's PR merges, rebase your branch on `main` and drop your `docs/todos/` copy of the spec (it now lives in `docs/done/`).

## Gotchas

- Cloud child sessions cannot message the parent session back — track progress through the child's PR and the sessions list, not by waiting for a ping.
- If the child's init fails with "Setup script failed", the session was created without a source checkout — archive it and respawn with the repo + revision attached.
- One finding, one session, one PR. Several findings at once means several delegations, not one omnibus fix branch.
