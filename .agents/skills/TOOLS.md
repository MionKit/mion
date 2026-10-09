# Tools for shared skills

Use the tools the current host exposes. These mappings keep each skill's requirements.
They grant no permissions and never override the user's instructions.

## Questions and plan approval

- Claude Code: `AskUserQuestion`, `EnterPlanMode`, `ExitPlanMode` when available.
- Codex: `request_user_input` in plan mode, or the available asynchronous question tool, for clarification.
  Respect each tool's option limits and free-text behavior.
- Codex approval: present the concrete plan in chat or an opened Markdown file; wait for explicit approval.
  `update_plan` tracks progress; it neither asks for nor records approval. A saved plan is not approval.
- No question tool → ask in chat. Never answer a required question for the user.
- Honor answers and approval already given in this session.

## Independent agents

Roles (Claude definition, Codex definition → shared skill):

- `pr-reviewer`: `.claude/agents/pr-reviewer.md`, `.codex/agents/pr-reviewer.toml` → `review-pr`.
- `docs-simplifier`: `.claude/agents/docs-simplifier.md`, `.codex/agents/docs-simplifier.toml` → `simplify-docs`.
- `comments-simplifier`: `.claude/agents/comments-simplifier.md`, `.codex/agents/comments-simplifier.toml`
  → `simplify-comments`.

Spawning:

- Claude Code: `Agent` with `subagent_type` = the named role.
- Codex CLI: `spawn_agent` with `agent_type` = the configured role.
- Other Codex hosts may expose a collaboration tool without `agent_type`: spawn a child with `fork_turns: "none"`,
  pass the `developer_instructions` from its Codex definition verbatim, the target, and the shared skill path.
  Keep the role's limits. An instruction-only fallback cannot enforce the reviewer's read-only sandbox:
  never claim it does.
- Named role unavailable in Claude → spawn `general-purpose` with the body of its Claude definition,
  the target, and the shared skill path.
- Reviewers + simplifiers get a fresh context: never pass the author's reasoning, earlier review reports,
  or the parent's conversation history.
- Research + planning: Claude's `Explore` or `Plan` types where available, or an independent Codex agent
  with a read-only research/planning prompt.
- No independent agents → report the missing capability. Never replace independent review or simplification
  with a pass by the author.

## User-visible background sessions

Separate from internal agents. The user must be able to inspect and steer the new session in their sessions list.

- Claude: available Claude session tools in the Mion cloud environment, or a supported local agent-view session.
  Supply the source and stable revision.
- Codex desktop: discover `create_thread` and its supported source/worktree options.
  Follow host rules for explicit user authorization to create a new chat; a skill instruction never overrides them.
  User already authorized the new chat → continue without asking again.
- Codex CLI or cloud: an exposed user-visible session API if available. Internal `spawn_agent` alone does not count.
- Session API, source/revision support, or authorization missing → file the finding as a guidelines todo
  in the current PR instead (header of the delegate-finding skill). Never claim delegation until a session exists.
- Use real session links or ids from the host. Record stable commit, child session, merge-order dependency
  as the skill requires.

## Pull requests and CI

- GitHub connector or `gh`: PR creation, metadata, labels, checks.
- Keep literal newlines in PR descriptions: structured arguments or `gh --body-file`.
- Codex desktop: attach every created PR with `codex_app.attach_artifact` when available.
- Claude may expose `subscribe_pr_activity`: use it when available.
- Codex may expose monitoring or automation tools: use only within the user's authorized scope.
- Otherwise `gh pr checks` or connector checks with bounded polling. Fix failures, verify the latest commit.
- Report missing authentication or monitoring tools. Never report CI green without checking it.
