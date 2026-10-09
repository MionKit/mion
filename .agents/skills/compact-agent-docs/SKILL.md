---
name: compact-agent-docs
description: Shrink AGENTS.md and skill files to the size limit without losing a rule. 2 subagents per task.
---

# compact-agent-docs

Use [the tool mapping](../TOOLS.md) for assistant-specific calls and fallbacks.

Goal: every AGENTS.md, CLAUDE.md, file under a `skills/` dir and file under `.agents/` stays short.
Agent reads less, follows more. Zero rules lost.

## Limits

- Max 100 lines per file. Aim ≤ 90: room to grow.
- Max 120 chars per line. Frontmatter `description:` line too.
- Check: `node scripts/ci/check-tree.mjs`. Limits live in `AGENT_DOC_MAX_*` there.

## Pipeline: 2 subagents per task, in order

One task = one group of related files.

1. **Rewrite**: [simplify.md](simplify.md) then [split.md](split.md). One subagent, one pass over the files.
2. **Verify**: [verify.md](verify.md). Fresh subagent, never the rewriter. Restores anything lost.

Every stage reads [style.md](style.md) first.

## Orchestration (caller)

- No file list given → full run: `node scripts/ci/check-tree.mjs`, group every agent-doc row, run all tasks.
- Show the groups to the user once before launching. Then run to the end without stopping.
- Group files that share a topic or a dir: e.g. all `website-browser/` files, all drizzle package AGENTS.md.
- Tasks run in parallel. Stages inside one task run in sequence.
- ⚠️ Two tasks never edit the same file. Root `AGENTS.md` belongs to ONE task.
  Other tasks needing a root pointer line → put it in their report; root task (or caller) adds it.
- Give each subagent: task file list, base ref (`HEAD` unless told), its stage file path.
- Pass the rewrite report to the verifier.
- Bug reported outside the task files → caller runs [delegate-finding](../delegate-finding/SKILL.md).
- No commits from subagents. Caller reviews, then commits per task when user asks.
- After all tasks: `node scripts/ci/check-tree.mjs` must show zero agent-doc rows.

## Hard rules (all stages)

- Never change meaning. Never invent a rule, command, flag or path.
- Exact tokens stay exact: identifiers, paths, commands, flags, env vars, numbers, error text.
- One fact, one home. Duplicate → keep the best home, others link or drop.
- A move leaves no "moved to" note. Only a pointer line with a trigger.
- No em dashes, no en dashes. Use `:`, `,`, `→` or a new bullet.
- Never run a formatter on these files.
- Packaged skills (`packages/*/skills/`) ship to npm: links stay inside that skill dir.
