---
name: delegate-finding
description: Hand an unrelated finding to a parallel background session, own todo/branch/PR. Use on off-task bug or gap.
---

# delegate-finding

> **Codex + other non-Claude hosts:** first check you can start a session the user can see and steer
> (background-session section of [the tool mapping](../TOOLS.md)). An internal subagent does not count.
> Cannot → skip steps 3-6: file the finding as a guidelines todo (step 2), commit it in the current PR,
> name it in the PR description + final message, keep working.

Hand an unrelated finding to a parallel agent; main session stays focused. Output:

- a filed guidelines todo;
- a pushed stable commit;
- a running background session the user can steer;
- a recorded merge-order dependency (finding's PR before the main task's PR).

Related findings are NEVER delegated: fix them in the current task + PR
(findings rule, [AGENTS.md](../../../AGENTS.md)).
Delegate only what is off the current task's code path.

## One level deep

Only a session the user started directly runs this skill. A delegated session (prompt names a parent) never spawns one:

- Fixes every finding it meets in its own PR.
  A fix often has several causes: a second issue on the same feature = related.
- Clearly unrelated finding → guidelines todo ([create-todo skill](../create-todo/)), committed in its own PR,
  named in its PR description + final message. Never opens a session for it.

## The flow

1. **Surface it first.** Tell the user: what the finding is, where it came from, whether it predates your change
   (bisect if cheap). Delegation never replaces surfacing.
2. **File it as a GUIDELINES todo** with the [create-todo skill](../create-todo/), not a full plan:
   evidence, repro, intent. Lands in `docs/todos/`.
   Real planning left to the implementer (implement-todo plans before coding anyway).
3. **Pin a stable commit.** Commit current work + the new todo doc on YOUR branch, push.
   Handoff point: background session starts here, sees the todo + the exact tree that exposed the finding.
   Never hand off from a dirty or unpushed tree.
4. **Spawn the background session.** MUST be one the user can peek at, reply to, steer:
   a cloud session in their sessions list (claude.ai/code / the Claude Code app)
   or a local [agent view](https://code.claude.com/docs/en/agent-view) session. Cloud sessions:
   - Environment: the **Mion cloud environment** (named "Mion", carries the mion + mion setup scripts).
   - Source: `https://github.com/MionKit/mion`, revision = your branch at the stable commit.
     ⚠️ A session with no source dies at init: the setup script needs a checkout.
5. **Instruct the child.** Standalone prompt (zero context). Always opens with a link to this session,
   `https://claude.ai/code/<your session id>` (`get_session` with no id prints it), so every child traces to its parent.
   Template:
   ```
   You are fixing a finding delegated from the parent session https://claude.ai/code/<parent-session-id>.
   The spec is `docs/todos/<file>.md` on this checkout. Create a NEW branch cut from `origin/main`
   (e.g. `fix/<finding>`), carry the spec onto it with `git checkout <stable-sha> -- docs/todos/<file>.md`,
   then run the **implement-todo skill** on that spec end to end: plan, implement, PR-readiness gate,
   move the spec to `docs/done/`, push, and open a PR. Your PR must contain ONLY the finding's fix,
   none of the parent branch's in-flight work. Link the parent session in the PR description.
   You are a delegated session: fix every other issue you find in this same PR, and never start another session.
   An issue clearly unrelated to this fix becomes a guidelines todo in `docs/todos/` (create-todo skill),
   committed in this PR and named in its description.
   ```
   Branch cut from `origin/main`, not the stable commit: finding's PR carries only the fix.
   Stable-commit checkout only gives the child the todo + context; never its PR base.
6. **Record the ordering, keep working.** Finding's PR merges BEFORE the main task's PR:
   - State the dependency in the main PR's description. Never merge the main PR past it
     (main PR waiting keeps the parallel fix from stalling).
   - After it merges: rebase your branch on `main`, drop your `docs/todos/` copy of the spec (now in `docs/done/`).

## Gotchas

- Cloud child sessions cannot message the parent back: track via the child's PR + sessions list, not a ping.
- Child init fails with "Setup script failed" → created without a source checkout.
  Archive it, respawn with repo + revision attached.
- One finding, one session, one PR. Several findings = several delegations, never one omnibus fix branch.
