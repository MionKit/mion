---
type: docs
spec: guidelines
status: done
created: 2026-07-26
completed: 2026-07-26
---

# Thin every published README down to a description and a link

**Status:** done (see [What shipped](#what-shipped) below)
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

> **Correction found while implementing:** that last paragraph was wrong. The `README.md` copy in
> `build-binaries.mjs` happens in `stageLauncher()`, which stages `@ts-runtypes/bin` only.
> `buildPlatform()` wrote a `package.json`, a `LICENSE` and `lib/` and nothing else, so all **seven**
> per-platform packages were publishing a **blank** npm page. Fixed as part of this change.

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
- Whatever shape is settled on is worth one line in CLAUDE.md so the next pass leaves them alone.

## Out of scope

The repo-internal docs ([SETUP.md](../../SETUP.md), [docs/](../), `.claude/skills/`) — they are for
contributors and agents, and depth there is the point.

The root [README.md](../../README.md) was also left alone: it is the GitHub landing page rather than
an npm shop window, it is not published to any registry, and the todo's own table scoped the work to
the three package READMEs. CLAUDE.md now states that exemption explicitly.

## What shipped

**Website first, then the removals.** The only fact in any README with no home on the site was the
non-Vite bundler wiring: [container/website/content/1.introduction/3.quick-start.md](../../container/website/content/1.introduction/3.quick-start.md)
gained an **Other bundlers** section (entry-point table, the `unplugin` escape hatch, the note that
the rewrite is identical across bundlers and Vite additionally wires hot reload), backed by a real
`<code-import>` example, [packages/examples/src/introduction/quick-start-rollup-config.ts](../../packages/examples/src/introduction/quick-start-rollup-config.ts),
with a matching `paths` entry in [packages/examples/tsconfig.json](../../packages/examples/tsconfig.json)
so the root `typecheck` fails if the `/rollup` entry ever moves. Everything else removed was already
covered: the devtools Options table by the [configuration guide](https://runtypes.pages.dev/introduction/configuration)
(`validate` / `numberMode` by the [validation guide](https://runtypes.pages.dev/guide/validation)),
the Linting section by the [linting guide](https://runtypes.pages.dev/guide/linting), the core Usage
snippets by the quick start and the feature guides.

**The three READMEs** are now a description, the sibling relationship, a Documentation link block, and
Status + License (88 → 31, 116 → 35, 38 → 30 lines). License blocks were added to `@ts-runtypes/devtools`
and `@ts-runtypes/bin`, which had none.

**The Entry points judgement call:** thinned, not dropped and not kept as a table. Which subpaths the
package exposes is genuinely package-shaped, so `@ts-runtypes/devtools`'s README keeps a single prose
line naming them; the per-entry "what it is" column, the HMR / esbuild-`onLoad` note and the wiring
examples moved to the website section above.

**The launcher's API/CLI prose is gone rather than moved.** `getExePath()` is called by
`@ts-runtypes/devtools`, never by a consumer, so it belongs to neither surface; `npx ts-runtypes-bin --version`
already appears on [Built on typescript-go](https://runtypes.pages.dev/introduction/built-on-typescript-go).

**The per-platform packages** now get their own generated README from `platformReadme()` in
[scripts/release/build-binaries.mjs](../../scripts/release/build-binaries.mjs) (npm packs `README.md`
regardless of `files`, the same way it already packs the `LICENSE` those packages ship): what the
payload is, that it is an optional dependency of `@ts-runtypes/bin` nobody installs by hand, the docs
link, and the license.

**Pinned by a test, and by one line in CLAUDE.md.** The existing published-README contract in
[packages/ts-runtypes-devtools/test/repo-contracts.test.ts](../../packages/ts-runtypes-devtools/test/repo-contracts.test.ts)
gained a "stays a description plus links" case per package: a 45-line cap, no markdown table
separator rows, no `RT_*` / `process.env` mentions, and a `runtypes.pages.dev` link present. The
rule itself is stated in the JS-monorepo section of [CLAUDE.md](../../CLAUDE.md).
