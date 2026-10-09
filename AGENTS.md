# Mion & RunTypes Guidelines

> ⚠️ Reply to the user in plain everyday language, extremely condensed phrases.
> No jargon or internal nicknames unless very basic. Unclear term or idea → define it in one short sentence,
> add a tiny code example when it helps. Never use em dashes "—".

## Setup

- Setup, build, test, publish: [SETUP.md](SETUP.md), the single setup document.
- Host not set up → [mion-setup skill](.agents/skills/ts-runtypes-setup/) runs the whole bootstrap. Never hand-roll one!
- Needs Go ≥ 1.26, Node ≥ 26, podman ≥ 4.0, git, pnpm ≥ 11.
- pnpm only, never `npm install`. Workspace policies live in `pnpm-workspace.yaml`.
- `.npmrc` = auth/registry only: anything else there is silently ignored.
- Prefer a `package.json` script over raw `pnpm exec <cmd>` when one exists.

## Assistant support

- Claude Code + Codex share this file and `.agents/skills/`. Read the matching `SKILL.md` before using a skill.
- Claude finds the same skills through the `.claude/skills` symlink.
- Claude config in `.claude/`, Codex config in `.codex/`. Never copy settings or permissions between them.
- Questions, approval, independent agents, background sessions: [the tool mapping](.agents/skills/TOOLS.md).
  Keep the workflow's requirements when tool names differ.
- Capability unavailable → report it. Never silently skip a required step or review your own work.

## ⚠️ Any issue found during a task is FIXED, not filed for later

Rule broken most often. Any issue or blocker found during a task gets fixed before the task is done:

- Related to the task → fix it in the SAME task + SAME PR, own commit, own test.
  Size buys no exemption: big related finding = bigger PR, not a later one.
- Completely unrelated → run [delegate-finding](.agents/skills/delegate-finding/): a PARALLEL background agent
  gets it (todo + delegation), never a backlog. Cannot delegate → file a todo in the current PR.
- Delegated session never delegates again: fixes all in its own PR, files a truly unrelated finding as a todo there.
- A [docs/todos/](docs/todos/) spec = commitment to solve it, never a way to close the loop.
- Absolute: never let a finding slide and get lost. Fix it or delegate it. Open question you can't solve → ask.
- No other file (doc, skill, workflow, test, code comment) names a `docs/todos/` or `docs/done/` doc: they get deleted.
  Put the reasoning in the file that needs it. A spec may list docs that could go stale once it merges, inside itself.

## ⚠️ A removed thing leaves NO trace

Removed/renamed option, setting key, config key, lint rule, export, alias, CLI flag, env var or subpath = never existed:

- No fallback, alias or compatibility shim still reading the old name.
- No "was removed / renamed, use X instead" warning, error or hint. No test for any of that.
- No doc, comment, skill or spec line naming the old name. History lives in git, `docs/done/`, `CHANGELOG.md` only.
- Old name then fails like any unknown name (typo warning, host error). Enough.

## Commit + format

- Before committing: `pnpm run lint` + `pnpm run format`, fix errors first. `pnpm run lint` = both linters + typecheck.
- Format = `pnpm run format`. Never hand-format, never widen its scope. `pnpm run check-format` = read-only twin.
  - oxfmt over `packages/**/*.ts`, Prettier over `packages/**/*.md` (markdown only),
    `gofmt -w` over `ts-go-runtypes/cmd` + `ts-go-runtypes/internal`.
  - Excluded on purpose: website / docs / scripts / `.claude` markdown (Prettier mangles MDC `::` components),
    vendored `third_party/` + `_deps/`, lockfiles, `testdata` golden fixtures.
  - Formatting seems needed outside that scope → STOP, surface it. Never run oxfmt / Prettier / gofmt by hand.
- [.husky/pre-commit](.husky/pre-commit) runs `lint-staged`. Wire hooks once per clone: `pnpm exec husky`
  (`ignoreScripts: true` blocks the root `prepare` script on install).
- Commit message: one Conventional-Commits subject. Short paragraph only if the why isn't in the diff.
  `Co-Authored-By` trailer stays last.
- Branch stays linear: rebase onto `origin/main`, never merge it in. Push with `--force-with-lease`.

## Build + test

- `pnpm test` needs a bootstrapped host (Go resolver, submodules + patches, `@mionjs/devtools` dist).
  Never report "tests pass" or "tests skipped" from an unbuilt host!
- Never `pnpm run build` during development, only for publishing.
  ONE exception: rebuild `@mionjs/devtools` after every src edit ([why](packages/devtools/AGENTS.md)).
- Marker API tests (Go or JS plugin) must cover both `getRunTypeId` call shapes, as paired tests. Follow the
  [Marker test coverage rule](ts-go-runtypes/AGENTS.md#marker-test-coverage-rule).

## Where things live

- JS packages, dependency rules, package map: [packages/AGENTS.md](packages/AGENTS.md).
  Read before a `package.json`, dependency or new-package change.
- Go resolver: [ts-go-runtypes/AGENTS.md](ts-go-runtypes/AGENTS.md) (directory layout, submodule/patch workflow,
  Marker test coverage rule). Read before touching anything under `ts-go-runtypes/`.
  `ts-go-runtypes/third_party/` = OFF-LIMITS git submodule.
- Pipeline invariants: [.agents/docs/architecture.md](.agents/docs/architecture.md).
  Read before touching markers, rewrites, caches, validators / decoders or the request pipeline.
- Code style + comments: [.agents/docs/code-style.md](.agents/docs/code-style.md). Read before editing source code.
- Tests, typecheck, lint: [.agents/docs/testing.md](.agents/docs/testing.md). Read before adding or running tests.
- Env vars: [.agents/docs/env-vars.md](.agents/docs/env-vars.md). Read before adding or reading an env var.
- Git workflow + release line: [.agents/docs/git.md](.agents/docs/git.md). Read before a rebase, push or release.
- PR readiness + CI labels: [.agents/docs/pr-ready.md](.agents/docs/pr-ready.md). Read before opening a PR.
- Containers: [container/AGENTS.md](container/AGENTS.md). Read before any container, bench, website or e2e command.
- Website pages: [container/website/AGENTS.md](container/website/AGENTS.md) + prose rules
  [.agents/docs/website-writing.md](.agents/docs/website-writing.md). Read before writing or editing a page.
- `miondevx` CLI, clean, `tools/`: [scripts/AGENTS.md](scripts/AGENTS.md). Read before running or adding a dev command.
