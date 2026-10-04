# Tools for shared skills

Use the tools exposed by the current host. These mappings preserve the skill's
requirements; they do not grant permissions or override the user's instructions.

## Questions and plan approval

- Claude Code: use `AskUserQuestion`, `EnterPlanMode`, and `ExitPlanMode` when available.
- Codex: use `request_user_input` in plan mode or the available asynchronous question
  tool for clarification. Respect each tool's option limits and free-text behavior.
- For approval in Codex, present the concrete plan in chat or in an opened Markdown
  file and wait for the user's explicit approval. `update_plan` tracks progress;
  it does not ask for or record approval. A saved plan is not approval by itself.
- If a question tool is unavailable, ask in chat. Never answer a required question
  for the user. Honor answers and approval already given in this session.

## Independent agents

| Role | Claude Code definition | Codex definition | Skill |
| --- | --- | --- | --- |
| `pr-reviewer` | `.claude/agents/pr-reviewer.md` | `.codex/agents/pr-reviewer.toml` | `review-pr` |
| `docs-simplifier` | `.claude/agents/docs-simplifier.md` | `.codex/agents/docs-simplifier.toml` | `simplify-docs` |
| `comments-simplifier` | `.claude/agents/comments-simplifier.md` | `.codex/agents/comments-simplifier.toml` | `simplify-comments` |

- Claude Code: use `Agent` with `subagent_type` set to the named role.
- Codex CLI: use `spawn_agent` with `agent_type` set to the configured role.
- Other Codex hosts may expose a collaboration tool without `agent_type`. Spawn a
  child with `fork_turns: "none"` and pass the `developer_instructions` from its
  Codex definition verbatim, the target, and the shared skill path. Preserve the
  role's limits. An instruction-only fallback cannot enforce the reviewer's
  read-only sandbox; do not claim that it does.
- If the named role is unavailable in Claude, spawn `general-purpose` with the
  body of its Claude definition, the target, and the shared skill path.
- Use a fresh context for reviewers and simplifiers. Do not pass the author's
  reasoning, previous review reports, or the parent's conversation history.
- For research and planning, use Claude's `Explore` or `Plan` types where available,
  or an independent Codex agent with a read-only research/planning prompt.
- If independent agents are unavailable, report the missing capability. Do not
  replace independent review or simplification with a pass by the author.

## User-visible background sessions

These are separate from internal agents. The user must be able to inspect and
steer the new session in their sessions list.

- Claude: use the available Claude session tools in the Mion cloud environment,
  or a supported local agent-view session. Supply the source and stable revision.
- Codex desktop: discover `create_thread` and its supported source/worktree options.
  Follow host requirements for explicit user authorization to create a new chat.
  A skill instruction does not override that requirement. If the user has already
  authorized the new chat, continue without asking again.
- Codex CLI or cloud: use an exposed user-visible session API if one is available.
  Internal `spawn_agent` alone does not satisfy this workflow.
- If the required session API, source/revision support, or authorization is missing,
  file the finding as a guidelines todo in the current PR instead (the header of the
  delegate-finding skill). Never claim delegation succeeded until a session exists.
- Use real session links or identifiers supplied by the host. Record the stable
  commit, child session, and merge-order dependency as required by the skill.

## Pull requests and CI

Use the available GitHub connector or `gh` for PR creation, metadata, labels, and
checks. Preserve literal newlines in PR descriptions with structured arguments or
`gh --body-file`. Codex desktop should attach every created PR using
`codex_app.attach_artifact` when available.

Claude may expose `subscribe_pr_activity`; use it when available. Codex may expose
monitoring or automation tools; use those only within the user's authorized scope.
Otherwise use `gh pr checks` or connector checks with bounded polling, fix failures,
and verify the latest commit. Report missing authentication or monitoring tools;
never report CI as green without checking it.
