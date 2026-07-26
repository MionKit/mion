---
type: docs
spec: guidelines
status: todo
created: 2026-07-26
---

# Thin every published README down to a description and a link

**Status:** todo
**Created:** 2026-07-26 (owner call while reviewing [docs/done/getexepath-env-override.md](../done/getexepath-env-override.md))

The npm README is a public surface, and ours have grown into a second copy of the docs site. They
should be a **short description of the package plus a pointer to
[runtypes.pages.dev](https://runtypes.pages.dev/)** — nothing a reader would have to keep in sync
with anything else.

## Where they stand today

| README | Lines | Sections |
| --- | --- | --- |
| [packages/ts-runtypes/README.md](../../packages/ts-runtypes/README.md) | 88 | Install, Usage, Documentation, Status, License |
| [packages/ts-runtypes-devtools/README.md](../../packages/ts-runtypes-devtools/README.md) | 116 | Entry points, Install, Usage, Options (a 19-row table), Linting, Documentation, Status |
| [packages/ts-runtypes-bin/README.md](../../packages/ts-runtypes-bin/README.md) | 38 | API, CLI, Documentation |

The launcher's README is also what every per-platform `@ts-runtypes/binary-<os>-<arch>` package
ships: [scripts/release/build-binaries.mjs](../../scripts/release/build-binaries.mjs) copies
`README.md` alongside `package.json`, `lib/` and `bin/` into each staged package.

## Why

- **Duplication drifts.** The devtools Options table restates the
  [configuration guide](https://runtypes.pages.dev/introduction/configuration); the same class of
  drift already produced the stale-doc cluster that `main` had to sweep. One home per fact.
- **The npm page is a shop window, not a manual.** A reader needs to know what the package is, how
  it relates to its siblings, and where the real docs are.
- **It keeps internal knobs out by construction.** `RT_BIN` had to be reverted out of two READMEs
  and two website pages during review precisely because those surfaces are public.

## Direction (decide the details while doing it)

- Keep: the one-paragraph description, the sibling relationship (core ⇄ devtools ⇄ bin), the
  Documentation link, and the license/status lines a published package is expected to carry.
- Move to the website (most of it is already there): the Options table, the Usage snippets, the
  Linting section, and the launcher's API/CLI prose.
- Judgement call worth making explicitly: the devtools **Entry points** table (`/vite`, `/rollup`,
  `/eslint`, …) is the one thing that is genuinely package-shaped rather than product-shaped. Keep
  it or move it, but decide rather than drift.
- Check the site actually covers whatever is removed BEFORE removing it; if a fact has no home
  there, write it there first.
- Remember the per-platform packages inherit the launcher README, so whatever it says is published
  eight times.

## Done when

- Each of the three READMEs is a short description plus links, with no option tables, no
  environment variables, and no internal/dev-only content.
- Nothing removed is lost: every fact worth keeping exists on the website.
- The CLAUDE.md rule (**Public surfaces**) is updated from "don't grow them" to "these are settled,
  don't touch them" once this lands.

## Out of scope

The repo-internal docs ([SETUP.md](../../SETUP.md), [docs/](../), `.claude/skills/`) — they are for
contributors and agents, and depth there is the point.
