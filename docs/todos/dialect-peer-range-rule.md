---
type: docs
spec: guidelines
status: ready
created: 2026-11-07
---

# Name the dialect packages' core peer in the exact-pin rule

## Intent

`packages/AGENTS.md` says every dependency is exact-pinned and only FOUR peer dependencies stay ranges.
The three dialect packages (`@mionjs/drizzle-orm-{mysql,pg,sqlite}-core`) carry a fifth: a ranged
`@mionjs/drizzle-orm` peer (`>=X.Y.Z <X.(Y+1).0`). The release bump writes it on purpose
(`rootPeerRangeFor` in `scripts/lib/drizzle-line.mjs`): floored at the core version the dialect ships with,
capped at the drizzle minor line, so all dialects share the consumer's single core copy and a core patch never
forces a dialect republish. The tool is right; the rule is stale. Nothing checks this peer today either.

## Direction

- Rule side loses: `packages/AGENTS.md` names the fifth peer range and why, and adds `@mionjs/drizzle-orm`
  to the dialect packages' per-package devDependency exception (they already carry it as `workspace:*`).
- Enforce it: `check-drizzle-versions.mjs` (the CI gate) also checks the dialect's `@mionjs/drizzle-orm`
  peer: a range on the drizzle minor line that the core's current version satisfies, never a dependency,
  a `workspace:*` devDependency. Keep the logic in `drizzle-line.mjs` so it is unit-tested.
- Implementer plans the details.

## Docs

`packages/AGENTS.md`, existing section "Dependencies". No website page: release internals only.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- The rule and the bump tool agree, and the gate fails on a pinned or off-line core peer, with a test.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.
