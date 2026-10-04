# Claude and Codex repository support

Status: implemented after user approval on 2026-10-04; verification details below.

## Goal

Both Claude Code and Codex can read the repository rules, discover the same skills,
and perform the existing review and simplification workflows using their own
configuration.

Share instructions and skills. Keep agent definitions, hooks, settings, and
tool permissions separate for each assistant.

## Already completed

The user authorized removing `container/website/AGENTS.md`. It contained only
pointers already covered by `container/website/CLAUDE.md`; no rules needed moving.
That deletion is currently uncommitted. No other migration changes have started.

## Proposed layout

```text
AGENTS.md
packages/<package>/AGENTS.md
container/website/AGENTS.md
ts-go-runtypes/AGENTS.md
.agents/
  skills/<skill>/
    SKILL.md
    references, scripts, and examples as needed
.claude/
  skills -> ../.agents/skills
  agents/
  hooks/
  output-styles/
  settings.json
  launch.json
.codex/
  config.toml
  agent definitions and hooks in the supported Codex format
```

The nested instruction paths above are examples. Preserve every existing scope.
There will be no shared `.agents/roles/` directory and no shared hook migration.

## Implementation

### 1. Confirm supported versions and configuration formats

- Claude Code 2.1.277 introduced `AGENTS.md` discovery when no `CLAUDE.md` exists.
  Choose a minimum version that also covers the deployment providers used here.
- Verify the installed or targeted Codex version supports `.agents/skills/`,
  custom agents, and any proposed hook configuration.
- Verify Claude discovers skills through the relative directory symlink.
- Record minimum versions and environment setup in `SETUP.md`.
- If a required capability is unavailable, report it before choosing a replacement;
  do not claim equivalent support based only on matching file names.

### 2. Migrate repository instructions

- Rename all 17 tracked, first-party `CLAUDE.md` files to `AGENTS.md`.
- Rename the website's `CLAUDE.md` directly, with no merge of its deleted pointer file.
- Preserve rule content and nested scope; adapt only assistant-specific wording
  needed for both tools to follow the rules.
- Update active links, script lookups, errors, comments, and tests to the new names.
- Leave the third-party submodule and historical documents untouched.

### 3. Share the 14 skills

- Move complete skill directories from `.claude/skills/` to `.agents/skills/`.
- Commit `.claude/skills` as a relative symlink to `../.agents/skills`.
- Update canonical links and shell commands to `.agents/skills/`.
- Preserve scripts, references, examples, and executable permissions.
- Check relative links and scripts that derive their location from their own path.
- Make shared workflows describe the required behavior without assuming Claude
  tool names. Include concise Claude and Codex instructions where calls differ.
- Review `review-pr`, `implement-todo`, `create-todo`, and `delegate-finding`
  especially: they refer to Claude agents, questions, or cloud sessions.
- Preserve independent review contexts, read-only reviewer limits, and approval
  requirements. Do not silently replace an independent review with self-review.
- Keep user-visible background sessions distinct from internal subagents. Use
  only supported, authorized session tools; report unavailable capabilities.

### 4. Configure agents separately

- Keep Claude's three agent definitions under `.claude/agents/` and update their
  instruction references.
- Add Codex definitions for `pr-reviewer`, `docs-simplifier`, and
  `comments-simplifier` using its documented configuration format.
- Preserve each role's restrictions and deliverables, with tool names and model
  settings appropriate to its own assistant.
- Some role text will be duplicated intentionally. Verify the important limits
  match during review; do not introduce a generator or shared role directory.

### 5. Keep hooks and settings separate

- Keep `.claude/hooks/`, `settings.json`, `output-styles/`, and `launch.json`
  Claude-specific, updating instruction and skill references where required.
- Add only supported Codex configuration and the startup behavior needed here.
  Do not copy Claude's JSON, hook payloads, or environment variables into Codex.
- Keep the existing Claude web setup entry point. Document Codex environment
  setup separately and reuse existing repository setup commands where applicable.
- Preserve shared language rules in `AGENTS.md`; Claude may retain its output style.
- Do not copy broad permissions from one assistant to the other. Keep local
  overrides and credentials untracked.

### 6. Update repository integration

- Update `review-pr/scope.sh` to locate governing `AGENTS.md` files.
- Update CI classification in `scripts/ci/lanes.mjs` for `.agents/`, `.codex/`,
  and `AGENTS.md`, preserving existing rules about which checks read those files.
- Update repository contracts and CI classification tests that name old paths.
- Update setup documentation, workflow messages, and applicable ignore rules.
- Run the relevant repository checks; avoid unrelated application changes.

## Validation and completion criteria

- All 17 first-party instruction files have been renamed, with their rules intact.
- No active first-party reference depends on a removed instruction or skill path.
- Both assistants discover all 14 skills. The Claude symlink resolves correctly.
- Both assistants load root and representative nested instructions from sessions
  started at the repository root and within a package.
- Each assistant can invoke all three configured agents with the intended limits.
- Startup checks work in the intended environments without unexpected installs,
  builds, or tests.
- Review scope, repository contracts, and affected CI classification checks pass.
- Document any runtime verification that cannot be performed here; do not label
  configuration as verified solely because it parses.
- Move this plan to `docs/done/` only after implementation, updating it to describe
  what was completed and any remaining limitations.

## Out of scope

- Application code or public API changes.
- Editing vendored dependencies or the third-party submodule.
- Sharing agent definitions, hooks, settings, launch files, or permissions.
- Installing plugins, changing cloud credentials, or publishing anything.

## Implementation notes and verification

- All 17 first-party instruction files use `AGENTS.md`; the website pointer file
  was discarded without merging its duplicate links.
- All 14 skills live in `.agents/skills/`, with a relative Claude directory symlink.
- Shared skills use a tool mapping for questions, approval, independent agents,
  background sessions, GitHub operations, and CI monitoring.
- Claude retains separate settings, agents, hooks, output style, and launch config.
- Codex has three separate TOML roles and a read-only informational startup hook.
  The reviewer uses Codex's read-only sandbox; simplifiers inherit the parent policy.
- Codex's project instruction budget is 128 KiB. The root file alone exceeded the
  default 32 KiB budget, so this setting is necessary to preserve nested rules.
- Minimum Claude version: 2.1.281 for all supported deployment providers.
  Codex configuration is checked with 0.159.0-alpha.3.
- Native Codex app-server discovery loaded all 14 skills without errors from the
  root and `packages/devtools/`, plus all three roles and the startup hook.
- Codex hook discovery reported no errors. Hook trust remains a normal user-level
  approval; no trusted hook hashes or global trust settings are committed.
- TOML parsed successfully and validated against Codex's published schema.
- The startup hook reports missing tools without installing or building anything;
  this host has no podman, which is reported correctly.
- Isolated startup-hook checks passed for missing artifacts, a ready checkout,
  nested working directories, invalid input, an old tool version, and no writes.
- Claude Code is not installed here. Live Claude instruction discovery, skill
  symlink discovery, and named-agent execution remain unverified on that runtime.
- Native model-backed Codex role execution was not performed. Configuration and
  discovery checks do not prove model behavior; fresh-context host checks and
  repository tests are recorded below as completed.

This task does not deploy, merge, or modify cloud credentials.


## Final checks

- 305 repository and CI contract tests passed.
- All eight always-on repository hygiene sweeps passed.
- Review scope reports the governing root and nested `AGENTS.md` files.
- The setup script resolves the checkout root through both skill paths.
- The independent comment simplifier reviewed 80 source targets and shortened
  comments in 77 files. The caller removed one stale private-plan pointer from
  the kept block while preserving its per-rule and paired-marker requirements.
- The comment-only diff guard passed. No application behavior changed.
- Guideline shortening is explicitly deferred to a separate task and PR, with
  a 100-line limit per `AGENTS.md` and no duplicated implementation details.
